import asyncio
from collections.abc import Awaitable, Iterable
from typing import Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import AuthContext, get_auth_context
from ..http_errors import detalhe_erro
from ..where import OPER_EQ, OPER_ILIKE, OPER_IN, corpo, where_and, where_eq

# Todos menos 0 Desativado, como o painel (CONTROLLR_API_NOTES.md, seção 6).
_CONTRATO_HABILITADO = [1, 2, 3, 4, 5]

router = APIRouter(prefix="/clientes", tags=["clientes"])

T = TypeVar("T")

_PARALELO = 6


async def _em_paralelo(tarefas: Iterable[Awaitable[T]]) -> list[T]:
    limite = asyncio.Semaphore(_PARALELO)

    async def uma(tarefa: Awaitable[T]) -> T:
        async with limite:
            return await tarefa

    return list(await asyncio.gather(*(uma(t) for t in tarefas)))


def _somente_digitos(valor: str) -> str:
    return "".join(c for c in valor if c.isdigit())


def _variantes_documento(digitos: str) -> list[str]:
    """client_doc1 pode estar gravado com ou sem máscara."""
    variantes = [digitos]
    if len(digitos) == 11:
        variantes.append(f"{digitos[:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:]}")
    elif len(digitos) == 14:
        variantes.append(f"{digitos[:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:]}")
    return variantes


async def _contratos_por_pk(ctx: AuthContext, contract_pks: set[int]) -> dict[int, dict[str, Any]]:
    # contract/list por client_pk pode vir vazio: busca por contract_pk, um a um. sign_url=true traz
    # contract_sign_doc_link.
    pks = list(contract_pks)
    respostas = await _em_paralelo(
        ctx.controllr.contract_list(corpo(where_eq("contract.contract_pk", pk), sign_url="true")) for pk in pks
    )
    return {pk: r.results[0] for pk, r in zip(pks, respostas) if r.success and r.results}


async def _itens_contrato(ctx: AuthContext, contract_pk: int) -> list[dict[str, Any]]:
    # contract/svclist sem wrapper; filtro exige o prefixo "item.".
    resposta = await ctx.controllr.call_api_post(
        "/controllrctl/contract/svclist",
        corpo(where_eq("item.contract_pk", contract_pk), sort="contract_pk", dir="ASC"),
    )
    return resposta.results if resposta.success else []


@router.get("/busca")
async def buscar_clientes(
    doc: str | None = Query(default=None, description="CPF/CNPJ do cliente"),
    # Texto, não int: o número pode ter zeros à esquerda ("026906").
    contrato: str | None = Query(default=None, description="Número do contrato"),
    nome: str | None = Query(default=None, description="Nome/razão social (busca parcial)"),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    if not doc and not contrato and not nome:
        raise HTTPException(status_code=400, detail="Informe ao menos um filtro: doc, contrato ou nome.")

    client_pks: set[int] = set()

    async def por_doc() -> None:
        if not doc:
            return
        # Só clientes ativos (client_status=0). client_doc1 ILIKE %trecho%, com e sem máscara, como o painel.
        async def com_valor(valor: str) -> None:
            condicoes_doc = where_and(
                {"field": "client_status", "oper": OPER_EQ, "value": 0},
                {"field": "client_doc1", "oper": OPER_ILIKE, "value": f"%{valor}%"},
            )
            resposta = await ctx.controllr.client_list(corpo(condicoes_doc, action="list", start=0, limit=10))
            if resposta.success:
                client_pks.update(int(r["client_pk"]) for r in resposta.results if r.get("client_pk"))

        await asyncio.gather(*(com_valor(v) for v in _variantes_documento(_somente_digitos(doc))))

    async def por_contrato() -> None:
        digitos = _somente_digitos(contrato or "")
        if not digitos:
            return
        # contract_number é inteiro ("026906" = 26906), como o painel (CONTROLLR_API_NOTES.md, seção 13).
        condicoes = where_and(
            {"field": "contract_status", "oper": OPER_IN, "value": _CONTRATO_HABILITADO},
            {"field": "contract_number", "oper": OPER_EQ, "value": int(digitos)},
        )
        resposta = await ctx.controllr.contract_list(corpo(condicoes, action="list", start=0, limit=10))
        if resposta.success:
            client_pks.update(int(r["client_pk"]) for r in resposta.results if r.get("client_pk"))

    async def por_nome() -> None:
        if not nome:
            return
        condicoes = where_and(
            {"field": "client_status", "oper": OPER_EQ, "value": 0},
            {"field": "client_complete_name", "oper": OPER_ILIKE, "value": f"%{nome.strip()}%"},
        )
        resposta = await ctx.controllr.client_list(
            corpo(condicoes, page=1, start=0, limit=15, sort="client_complete_name", dir="ASC")
        )
        if resposta.success:
            for registro in resposta.results:
                if registro.get("client_pk"):
                    client_pks.add(int(registro["client_pk"]))

    await asyncio.gather(por_doc(), por_contrato(), por_nome())

    async def montar(client_pk: int) -> dict[str, Any] | None:
        cliente_resp, cpes_resp = await asyncio.gather(
            ctx.controllr.client_list(corpo(where_eq("client.client_pk", client_pk), action="list", start=0, limit=1)),
            ctx.controllr.cpe_list_combo(corpo(where_eq("aaa_cpe.client_pk", client_pk), limit=20)),
        )
        # "aaa_cpe.client_pk" — nome real da tabela é "aaa_cpe", não "cpe".
        cliente = cliente_resp.results[0] if cliente_resp.success and cliente_resp.results else {}
        # Busca por contrato não filtra client_status na query: filtra aqui.
        if cliente.get("client_status") != 0:
            return None

        cpes = cpes_resp.results if cpes_resp.success else []

        # list_combo traz só contract_pk.
        contract_pks = {cpe["contract_pk"] for cpe in cpes if cpe.get("contract_pk") is not None}
        contratos_por_pk = await _contratos_por_pk(ctx, contract_pks)
        for cpe in cpes:
            contrato = contratos_por_pk.get(cpe.get("contract_pk"))
            if contrato:
                cpe["contract_number"] = contrato.get("contract_number")

        return {
            "client_pk": client_pk,
            "cliente": cliente,
            "cpes": cpes,
        }

    # Cada cliente já faz 2+ chamadas em paralelo; poucos clientes de cada vez.
    limite = asyncio.Semaphore(3)

    async def montar_limitado(client_pk: int) -> dict[str, Any] | None:
        async with limite:
            return await montar(client_pk)

    montados = await asyncio.gather(*(montar_limitado(pk) for pk in sorted(client_pks)))
    return {"success": True, "results": [m for m in montados if m is not None]}


@router.get("/{client_pk}")
async def detalhe_cliente(client_pk: int, ctx: AuthContext = Depends(get_auth_context)) -> dict[str, Any]:
    # Prefixo "client." evita coluna ambígua no join.
    cliente_resp = await ctx.controllr.client_list(
        corpo(where_eq("client.client_pk", client_pk), action="list", start=0, limit=1)
    )
    if not cliente_resp.success or not cliente_resp.results:
        raise HTTPException(status_code=404, detail=detalhe_erro("Cliente não encontrado.", cliente_resp))

    # addresses/list completo (traz siafi e coordenadas), aaa_cpe.client_pk e client_phone.client_pk; as três juntas.
    enderecos_resp, cpes_resp, telefones_resp = await asyncio.gather(
        ctx.controllr.call_api_post(
            "/controllrctl/addresses/list", corpo(where_eq("addresses.client_pk", client_pk), action="list", start=0)
        ),
        ctx.controllr.cpe_list_combo(corpo(where_eq("aaa_cpe.client_pk", client_pk), limit=20)),
        ctx.controllr.phone_list(corpo(where_eq("client_phone.client_pk", client_pk), sort="phone_pk", dir="ASC")),
    )
    cpes = cpes_resp.results if cpes_resp.success else []

    contract_pks = {cpe["contract_pk"] for cpe in cpes if cpe.get("contract_pk") is not None}
    contratos_por_pk = await _contratos_por_pk(ctx, contract_pks)
    for cpe in cpes:
        contrato = contratos_por_pk.get(cpe.get("contract_pk"))
        if contrato:
            cpe["contract_number"] = contrato.get("contract_number")

    itens = await _em_paralelo(_itens_contrato(ctx, pk) for pk in contratos_por_pk)
    for contrato, itens_do_contrato in zip(contratos_por_pk.values(), itens):
        contrato["itens"] = itens_do_contrato

    # Telefones com phone_pk (client_phones é só resumo), para editar em routers/telefones.py.

    return {
        "success": True,
        "cliente": cliente_resp.results[0],
        # Contratos vêm das CPEs do cliente; contrato sem CPE não interessa ao técnico.
        "contratos": list(contratos_por_pk.values()),
        "enderecos": enderecos_resp.results if enderecos_resp.success else [],
        "cpes": cpes,
        "telefones": telefones_resp.results if telefones_resp.success else [],
    }
