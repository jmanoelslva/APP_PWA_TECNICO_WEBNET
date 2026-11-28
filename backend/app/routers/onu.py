import asyncio
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..audit import registrar_auditoria
from ..deps import AuthContext, get_auth_context
from ..http_errors import detalhe_erro
from ..where import corpo, where_eq

router = APIRouter(prefix="/onu", tags=["onu"])

# Espera para a OLT recarregar. Mudou? Ajuste o timeout do proxy em deploy/*.conf.example.
ESPERA_APOS_RECONECTAR_OLT_S = 15
ESPERA_APOS_ATUALIZAR_ONU_S = 30


def _corpo_busca_wizard(search_term: str, search_value: str, sort: str) -> str:
    """Busca "wizard": filtrar onu/list por cpe_pk é ignorado e traz ONU de outro cliente."""
    campos = {
        "olt_pk": 0,
        "dp_pk": -1,
        "search_term": search_term,
        "search_value": search_value,
        "frame_id": -1,
        "slot_id": -1,
        "port_id": -1,
        "onu_id": -1,
        "duplicate_serial": -1,
        "signal_min_limit": 128,
        "signal_max_limit": 128,
        "page": 1,
        "start": 0,
        "limit": 15,
        "sort": sort,
        "dir": "ASC",
    }
    return urlencode(campos)


def pppoe_igual(onu: Any, username: str) -> bool:
    """Busca por PPPoE é por trecho: só vale o PPPoE exato (da ONU ou da conexão)."""
    alvo = username.strip().lower()
    for campo in ("wancfg_pppoe_username", "cpe_username"):
        valor = getattr(onu, campo, None)
        if isinstance(valor, str) and valor.strip():
            return valor.strip().lower() == alvo
    return False


@router.get("/busca")
async def buscar_onu(
    serial: str | None = Query(default=None, description="Serial da ONU, impresso no equipamento"),
    username: str | None = Query(default=None, description="Usuário PPPoE do CPE do cliente — filtro confiável para localizar a ONU dele"),
    cpe_pk: int | None = Query(default=None),
    olt_pk: int | None = Query(default=None),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    if not serial and not username and not cpe_pk and not olt_pk:
        raise HTTPException(status_code=400, detail="Informe serial, username, cpe_pk ou olt_pk.")

    if serial:
        corpo_requisicao = _corpo_busca_wizard("onu_serial", serial.strip().upper(), sort="onu_ponid")
    elif username:
        corpo_requisicao = _corpo_busca_wizard("onu_wancfg_pppoe_username", username.strip(), sort="onu_pk")
    else:
        # cpe_pk no where é ignorado: o filtro abaixo garante a ONU certa.
        campo, valor = ("olt_pk", olt_pk) if not cpe_pk else ("cpe_pk", cpe_pk)
        corpo_requisicao = corpo(where_eq(campo, valor), limit=20)

    resposta = await ctx.controllr.onu_list(corpo_requisicao, model_return=True, model_extended=True)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível consultar a ONU.", resposta))

    resultados = resposta.results
    if cpe_pk is not None:
        resultados = [onu for onu in resultados if onu.cpe_pk == cpe_pk]
    if username and not serial:
        resultados = [onu for onu in resultados if pppoe_igual(onu, username)]

    return {"success": True, "results": [onu.model_dump(mode="json") for onu in resultados]}


@router.post("/{onu_pk}/atualizar")
async def atualizar_info_onu(
    onu_pk: int,
    request: Request,
    olt_pk: int = Query(...),
    onu_serial: str = Query(...),
    slot_id: int = Query(...),
    port_id: int = Query(...),
    onu_id: int = Query(...),
    frame_id: int = Query(default=1),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    # Reconecta a OLT (não derruba ONUs), espera, atualiza a ONU e espera refletir.
    await ctx.controllr.call_api_post("/fiber_ctl/olt/reconnect", urlencode({"olt_pk": olt_pk}))
    await asyncio.sleep(ESPERA_APOS_RECONECTAR_OLT_S)

    resposta = await ctx.controllr.onu_update_info(
        olt_pk=olt_pk, onu_serial=onu_serial, slot_id=slot_id, port_id=port_id, onu_id=onu_id, frame_id=frame_id
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível atualizar a ONU.", resposta))
    # O nome da OLT a tela de auditoria completa pelo onu_pk (routers/auditoria.py).
    registrar_auditoria(request, ctx.session, "onu.atualizar",
                        _alvo_onu(onu_pk, olt_pk, port_id, onu_id, None, onu_serial))

    await asyncio.sleep(ESPERA_APOS_ATUALIZAR_ONU_S)
    return {"success": True, "results": resposta.results}


def _alvo_onu(onu_pk: int, olt_pk: int, porta: int, onu_id: int, olt_nome: str | None,
              onu_serial: str | None, **extra: Any) -> dict[str, Any]:
    """Alvo da auditoria com o que o técnico reconhece (OLT, PON, número, serial)."""
    alvo = {"onu_pk": onu_pk, "olt_pk": olt_pk, "olt_nome": olt_nome, "porta": porta, "onu_id": onu_id,
            "serial": onu_serial, **extra}
    return {k: v for k, v in alvo.items() if v not in (None, "")}


# Sem doc. Corpo: olt_pk/frame_id/slot_id/port_id/onu_id.
@router.post("/{onu_pk}/reiniciar")
async def reiniciar_onu(
    onu_pk: int,
    request: Request,
    olt_pk: int = Query(...),
    slot_id: int = Query(...),
    port_id: int = Query(...),
    onu_id: int = Query(...),
    frame_id: int = Query(default=1),
    olt_nome: str | None = Query(default=None, max_length=128),
    onu_serial: str | None = Query(default=None, max_length=64),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    resposta = await ctx.controllr.call_api_post(
        "/fiber_ctl/onu/apply_reboot",
        urlencode({"olt_pk": olt_pk, "frame_id": frame_id, "slot_id": slot_id, "port_id": port_id, "onu_id": onu_id}),
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível reiniciar a ONU.", resposta))
    registrar_auditoria(request, ctx.session, "onu.reiniciar",
                        _alvo_onu(onu_pk, olt_pk, port_id, onu_id, olt_nome, onu_serial))
    return {"success": True, "results": resposta.results}


@router.post("/{onu_pk}/remover")
async def remover_onu(
    onu_pk: int,
    request: Request,
    olt_pk: int = Query(...),
    slot_id: int = Query(...),
    port_id: int = Query(...),
    onu_id: int = Query(...),
    frame_id: int = Query(default=1),
    olt_nome: str | None = Query(default=None, max_length=128),
    onu_serial: str | None = Query(default=None, max_length=64),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    resposta = await ctx.controllr.call_api_post(
        "/fiber_ctl/onu/delete",
        urlencode({"olt_pk": olt_pk, "frame_id": frame_id, "slot_id": slot_id, "port_id": port_id, "onu_id": onu_id}),
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível remover a ONU.", resposta))
    registrar_auditoria(request, ctx.session, "onu.remover",
                        _alvo_onu(onu_pk, olt_pk, port_id, onu_id, olt_nome, onu_serial))
    return {"success": True, "results": resposta.results}


@router.post("/{onu_pk}/renomear")
async def renomear_onu(
    onu_pk: int,
    request: Request,
    onu_name: str = Query(..., min_length=1, max_length=64),
    olt_pk: int = Query(...),
    slot_id: int = Query(...),
    port_id: int = Query(...),
    onu_id: int = Query(...),
    frame_id: int = Query(default=1),
    olt_nome: str | None = Query(default=None, max_length=128),
    onu_serial: str | None = Query(default=None, max_length=64),
    nome_anterior: str | None = Query(default=None, max_length=64),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    # Mesmos identificadores + onu_name ("Descrição" no painel).
    resposta = await ctx.controllr.call_api_post(
        "/fiber_ctl/onu/apply_rename",
        urlencode({"olt_pk": olt_pk, "frame_id": frame_id, "slot_id": slot_id, "port_id": port_id, "onu_id": onu_id, "onu_name": onu_name}),
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível renomear a ONU.", resposta))
    registrar_auditoria(request, ctx.session, "onu.renomear",
                        _alvo_onu(onu_pk, olt_pk, port_id, onu_id, olt_nome, onu_serial,
                                  onu_name=onu_name, nome_anterior=nome_anterior))
    return {"success": True, "results": resposta.results}


def _mesmo_pk(valor: Any, esperado: int) -> bool:
    try:
        return int(valor) == esperado
    except (TypeError, ValueError):
        return False


class ContextoAuditoriaAssociacao(BaseModel):
    """Como a ONU estava na tela antes de associar — só vai para a auditoria."""

    olt_nome: str | None = Field(default=None, max_length=128)
    cliente_anterior: str | None = Field(default=None, max_length=128)
    pppoe_anterior: str | None = Field(default=None, max_length=64)


class AssociarClientePayload(BaseModel):
    client_pk: int
    # Conexão escolhida pelo técnico.
    cpe_pk: int
    olt_pk: int
    slot_id: int
    port_id: int
    onu_id: int
    onu_serial: str
    frame_id: int = 1
    # WAN da ONU reenviada como veio: apply_wan exige o registro completo.
    wancfg_conntype: int | None = None
    wan_tpl_pk: int | None = None
    wancfg_vlanid: int | None = None
    wancfg_user_vlanid: int | None = None
    wancfg_cos: int | None = None
    wancfg_tcont: int | None = None
    wancfg_gemport: int | None = None
    wancfg_svlan: int | None = None
    wancfg_stpid: int | None = None
    wancfg_scos: int | None = None
    wancfg_pon_profile: str | None = None
    wancfg_pppoe_svcname: str | None = None
    wancfg_local_ip: str | None = None
    auditoria: ContextoAuditoriaAssociacao | None = None


@router.post("/{onu_pk}/associar-cliente")
async def associar_cliente_onu(
    onu_pk: int, payload: AssociarClientePayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    # Usa usuário/senha da CPE escolhida, conferindo o cpe_pk da linha devolvida.
    cpes_resp = await ctx.controllr.cpe_list_combo(corpo(where_eq("aaa_cpe.cpe_pk", payload.cpe_pk), limit=20))
    cpes = cpes_resp.results if cpes_resp.success else []
    cpe = next((c for c in cpes if _mesmo_pk(c.get("cpe_pk"), payload.cpe_pk)), None)
    if cpe is None or not _mesmo_pk(cpe.get("client_pk"), payload.client_pk):
        raise HTTPException(status_code=404, detail="Conexão (CPE) não encontrada para este cliente.")

    campos = {
        "olt_pk": payload.olt_pk,
        "frame_id": payload.frame_id,
        "slot_id": payload.slot_id,
        "port_id": payload.port_id,
        "onu_id": payload.onu_id,
        "onu_serial": payload.onu_serial,
        "client_pk": payload.client_pk,
        "contract_pk": cpe.get("contract_pk"),
        "cpe_pk": cpe.get("cpe_pk"),
        "onu_wancfg_pppoe_username": cpe.get("cpe_username"),
        "onu_wancfg_pppoe_passwd": cpe.get("cpe_password"),
        "onu_wancfg_pppoe_svcname": payload.wancfg_pppoe_svcname or "",
        "onu_wancfg_conntype": payload.wancfg_conntype,
        "wan_tpl_pk": payload.wan_tpl_pk,
        "onu_wancfg_vlanid": payload.wancfg_vlanid,
        "onu_wancfg_user_vlanid": payload.wancfg_user_vlanid,
        "onu_wancfg_cos": payload.wancfg_cos,
        "onu_wancfg_tcont": payload.wancfg_tcont,
        "onu_wancfg_gemport": payload.wancfg_gemport,
        "onu_wancfg_svlan": payload.wancfg_svlan,
        "onu_wancfg_stpid": payload.wancfg_stpid,
        "onu_wancfg_scos": payload.wancfg_scos,
        "onu_wancfg_pon_profile": payload.wancfg_pon_profile or "",
        "onu_wancfg_local_ip": payload.wancfg_local_ip or "",
    }
    resposta = await ctx.controllr.call_api_post("/fiber_ctl/onu/apply_wan", urlencode(campos))
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível associar a ONU a este cliente.", resposta))
    antes = payload.auditoria or ContextoAuditoriaAssociacao()
    registrar_auditoria(request, ctx.session, "onu.associar_cliente",
                        _alvo_onu(onu_pk, payload.olt_pk, payload.port_id, payload.onu_id, antes.olt_nome,
                                  payload.onu_serial, cpe_pk=payload.cpe_pk,
                                  cliente=cpe.get("client_complete_name"), pppoe=cpe.get("cpe_username"),
                                  cliente_anterior=antes.cliente_anterior, pppoe_anterior=antes.pppoe_anterior))
    return {"success": True, "results": resposta.results}
