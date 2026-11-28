"""Auditoria de endereço, telefone e OS; busca de cliente em paralelo."""

import asyncio
from types import SimpleNamespace
from urllib.parse import parse_qs

import pytest
from fastapi.testclient import TestClient

from app import audit
from app.brbyteapi.controllr import AsyncControllr
from app.sessions import TechnicianSession

ENDERECO = {"address_pk": 5, "client_pk": 10, "address": "Rua A", "address_number": "12",
            "address_neighborhood": "Centro", "address_province": "Teresina", "address_state": "PI",
            "address_latitude": "-5.1", "address_longitude": "-42.8"}
TELEFONE = {"phone_pk": 8, "client_pk": 10, "phone_identification": "Celular", "phone_number": "86999990000"}


def ok(results=None):
    return SimpleNamespace(success=True, results=results or [], errors=None, total=len(results or []))


def where(body):
    return parse_qs(body).get("where", [""])[0]


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    from app.deps import get_current_session
    from app.main import app

    monkeypatch.setattr(audit, "AUDIT_LOG_PATH", str(tmp_path / "auditoria.jsonl"))
    monkeypatch.setattr(audit, "_ultimo_mes_limpo", None)

    # Controllr falso que devolve linhas extras, como quando ignora o filtro.
    async def post(self, caminho, body=None):
        if caminho == "/controllrctl/addresses/list":
            return ok([{**ENDERECO, "address_pk": 99, "address": "Outra"}, ENDERECO])
        if caminho == "/controllrctl/client/list":
            return ok([{"client_pk": 55, "client_complete_name": "Outro"},
                       {"client_pk": 10, "client_complete_name": "Maria da Silva"}])
        if caminho == "/controllrctl/phone/list":
            return ok([{**TELEFONE, "phone_pk": 99}, TELEFONE])
        return ok()

    async def sucesso(self, *a, **k):
        return ok()

    monkeypatch.setattr(AsyncControllr, "call_api_post", post)
    for nome in ("address_create", "address_update", "address_delete", "cpe_update", "phone_create", "phone_update"):
        monkeypatch.setattr(AsyncControllr, nome, sucesso)
    app.dependency_overrides[get_current_session] = lambda: TechnicianSession("s", "joao", "c", 7, 0)
    yield TestClient(app)
    app.dependency_overrides.clear()


def ultimo():
    return audit.consultar()[0][0]


def test_editar_endereco_grava_antes_e_depois(cliente):
    novo = {**ENDERECO, "address": "Rua B", "address_latitude": "-5.2"}
    novo.pop("address_pk")
    assert cliente.put("/enderecos/5", json=novo).status_code == 200
    ev = ultimo()
    assert ev["acao"] == "endereco.editar"
    assert ev["alvo"]["cliente"] == "Maria da Silva" and ev["alvo"]["address_pk"] == 5
    assert ev["alvo"]["endereco"] == "Rua B, 12 - Centro - Teresina/PI"
    assert ev["alvo"]["alteracoes"] == [
        {"rotulo": "Logradouro", "antes": "Rua A", "depois": "Rua B"},
        {"rotulo": "Localização", "antes": "-5.1, -42.8", "depois": "-5.2, -42.8"},
    ]


def test_telefones(cliente):
    assert cliente.post("/telefones", json={"client_pk": 10, "phone_identification": "Casa",
                                            "phone_number": "8632220000"}).status_code == 200
    assert ultimo()["alvo"] == {"client_pk": 10, "cliente": "Maria da Silva", "telefone": "Casa: 8632220000"}
    assert cliente.put("/telefones/8", json={**TELEFONE, "phone_number": "86988887777"}).status_code == 200
    ev = ultimo()
    assert ev["acao"] == "telefone.editar"
    assert ev["alvo"]["alteracoes"] == [{"rotulo": "Número", "antes": "86999990000", "depois": "86988887777"}]


def test_busca_de_cliente_em_paralelo(cliente, monkeypatch):
    em_voo = {"agora": 0, "max": 0}

    async def devagar(resultado):
        em_voo["agora"] += 1
        em_voo["max"] = max(em_voo["max"], em_voo["agora"])
        await asyncio.sleep(0.01)
        em_voo["agora"] -= 1
        return ok(resultado)

    async def client_list(self, body):
        w = where(body)
        if "client_complete_name" in w:  # busca por nome: 4 clientes
            return await devagar([{"client_pk": pk} for pk in (1, 2, 3, 4)])
        pk = int(w.split('"value":')[-1].rstrip("}]"))
        return await devagar([{"client_pk": pk, "client_status": 0 if pk != 3 else 1}])

    async def cpe_list_combo(self, body, model_return=False):
        return await devagar([{"cpe_pk": 1, "contract_pk": 70}])

    async def contract_list(self, body):
        return await devagar([{"contract_pk": 70, "contract_number": 1024}])

    monkeypatch.setattr(AsyncControllr, "client_list", client_list)
    monkeypatch.setattr(AsyncControllr, "cpe_list_combo", cpe_list_combo)
    monkeypatch.setattr(AsyncControllr, "contract_list", contract_list)

    r = cliente.get("/clientes/busca", params={"nome": "maria"}).json()
    assert [c["client_pk"] for c in r["results"]] == [1, 2, 4]  # o 3 está desabilitado
    assert all(c["cpes"][0]["contract_number"] == 1024 for c in r["results"])
    assert em_voo["max"] > 1  # saiu mais de uma chamada ao mesmo tempo


def test_detalhe_do_cliente_monta_tudo(cliente, monkeypatch):
    async def client_list(self, body):
        return ok([{"client_pk": 10, "client_complete_name": "Maria da Silva"}])

    async def cpe_list_combo(self, body, model_return=False):
        return ok([{"cpe_pk": 1, "contract_pk": 70}, {"cpe_pk": 2, "contract_pk": 71}])

    async def contract_list(self, body):
        pk = 70 if '"value":70' in where(body) else 71
        return ok([{"contract_pk": pk, "contract_number": pk + 1000}])

    async def phone_list(self, body):
        return ok([TELEFONE])

    async def post(self, caminho, body=None):
        if caminho == "/controllrctl/addresses/list":
            return ok([ENDERECO])
        if caminho == "/controllrctl/contract/svclist":
            return ok([{"item": where(body)}])
        return ok()

    for nome, f in (("client_list", client_list), ("cpe_list_combo", cpe_list_combo),
                    ("contract_list", contract_list), ("phone_list", phone_list), ("call_api_post", post)):
        monkeypatch.setattr(AsyncControllr, nome, f)

    r = cliente.get("/clientes/10").json()
    assert r["cliente"]["client_complete_name"] == "Maria da Silva"
    assert [c["contract_number"] for c in r["cpes"]] == [1070, 1071]
    assert sorted(c["contract_number"] for c in r["contratos"]) == [1070, 1071]
    # Cada contrato com os próprios itens, sem trocar um pelo outro.
    assert all(f'"value":{c["contract_pk"]}' in c["itens"][0]["item"] for c in r["contratos"])
    assert r["enderecos"] == [ENDERECO] and r["telefones"] == [TELEFONE]
