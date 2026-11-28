"""Ordem de Serviço: trabalho de campo de um ticket. Etapas: responder, iniciar e finalizar (com desfazer); fechar é só
do escritório. A etapa vem do evento mais recente em /support_ctl/op/list. Nome evita colisão com o módulo os."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ..audit import registrar_auditoria
from ..deps import AuthContext, get_auth_context
from ..http_errors import detalhe_erro
from ..where import OPER_EQ, OPER_GTE, OPER_LTE, corpo, where_and, where_in
from .onu import _corpo_busca_wizard

router = APIRouter(prefix="/os", tags=["ordem-servico"])

# OS aberta: agendada, sem fechar, cancelar ou apagar. Operadores 8/7 como no exemplo da doc.
_OPER_DATA_PREENCHIDA = 8
_OPER_IGUAL_OU_NULO = 7
# Limite explícito: sem ele, a finalização pode ficar fora da 1ª página.
_LIMITE_EVENTOS = 5000


def _condicoes_abertas() -> list[dict[str, Any]]:
    return [
        {"field": "op_date_sched", "oper": _OPER_DATA_PREENCHIDA, "value": None},
        {"field": "op_date_close", "oper": _OPER_IGUAL_OU_NULO, "value": None},
        {"field": "op_date_cancel", "oper": _OPER_IGUAL_OU_NULO, "value": None},
        {"field": "op_deleted", "oper": _OPER_IGUAL_OU_NULO, "value": False},
    ]


@router.get("")
async def listar_ordens_servico(
    minhas: bool = Query(default=True),
    abertas: bool = Query(default=True, description="Só OS agendadas e ainda não fechadas/canceladas"),
    ticket_pk: int | None = Query(default=None, description="Filtra pelas OS de um ticket específico"),
    start: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    condicoes: list[dict[str, Any]] = []
    if ticket_pk is not None:
        condicoes.append({"field": "ticket_pk", "oper": OPER_EQ, "value": ticket_pk})
    elif abertas:
        condicoes.extend(_condicoes_abertas())

    where = where_and(*condicoes) if condicoes else None
    resposta = await ctx.controllr.call_api_post(
        "/support_ctl/os/list",
        corpo(where, start=start, limit=limit, sort="op_date_sched", dir="ASC"),
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível listar as ordens de serviço.", resposta))

    resultados = resposta.results
    total = resposta.total
    # Total antes dos filtros abaixo, para a paginação.
    total_controllr = resposta.total
    if minhas:
        # Minhas = staff_username (user_pk é quem abriu).
        login = ctx.session.username.strip().lower()
        resultados = [o for o in resultados if str(o.get("staff_username") or "").strip().lower() == login]
        total = len(resultados)
    if ticket_pk is None and abertas:
        resultados = await _sem_finalizadas(ctx, resultados)

    return {"success": True, "results": resultados, "total": total, "total_controllr": total_controllr}


async def _sem_finalizadas(ctx: AuthContext, ordens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tira as finalizadas e marca a etapa (agendada, respondida, iniciada) pelos eventos 3/4/5."""
    ultimo = await _ultimos_eventos(ctx, ordens)
    if ultimo is None:
        return ordens  # falha aqui não deve esconder OS: melhor mostrar demais do que a menos

    def marcada(ordem: dict[str, Any], op_type: int, campo: str) -> bool:
        return _etapa_marcada(ultimo, ordem, op_type, campo)

    abertas = []
    for ordem in ordens:
        if marcada(ordem, 5, "op_date_finish"):
            continue
        if marcada(ordem, 4, "op_date_start"):
            ordem["etapa"] = "iniciada"
        elif marcada(ordem, 3, "op_date_answer"):
            ordem["etapa"] = "respondida"
        else:
            ordem["etapa"] = "agendada"
        abertas.append(ordem)
    return abertas


async def _ultimos_eventos(
    ctx: AuthContext, ordens: list[dict[str, Any]]
) -> dict[tuple[int, int], dict[str, Any]] | None:
    """Último evento de cada (OS, tipo 3/4/5), numa chamada. {} sem tickets; None se falhar."""
    tickets_pks = [o["ticket_pk"] for o in ordens if o.get("ticket_pk") is not None]
    if not tickets_pks:
        return {}

    resposta = await ctx.controllr.call_api_post(
        "/support_ctl/op/list",
        corpo(where_in("ticket_pk", tickets_pks), start=0, limit=_LIMITE_EVENTOS, sort="op_pk", dir="ASC"),
    )
    if not resposta.success:
        return None

    # Ordenado por op_pk ASC — o último write para cada (OS, tipo) vence.
    ultimo: dict[tuple[int, int], dict[str, Any]] = {}
    for evento in resposta.results:
        if evento.get("op_type") in (3, 4, 5) and evento.get("op_os_pk") is not None:
            ultimo[(evento["op_os_pk"], evento["op_type"])] = evento
    return ultimo


def _etapa_marcada(
    ultimo: dict[tuple[int, int], dict[str, Any]], ordem: dict[str, Any], op_type: int, campo: str
) -> bool:
    evento = ultimo.get((ordem.get("op_pk"), op_type))
    return bool((evento and evento.get(campo)) or ordem.get(campo))


_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.get("/resumo-dia")
async def resumo_do_dia(
    data: str = Query(description="Dia no formato AAAA-MM-DD (data do celular do técnico)"),
    ctx: AuthContext = Depends(get_auth_context),
) -> dict[str, Any]:
    """Agendadas e concluídas do dia (finalizada ou fechada; cancelada não conta)."""
    if not _DATA.match(data):
        raise HTTPException(status_code=400, detail="Data inválida (use AAAA-MM-DD).")
    faixa = [
        {"field": "op_date_sched", "oper": OPER_GTE, "value": f"{data} 00:00:00"},
        {"field": "AND"},
        {"field": "op_date_sched", "oper": OPER_LTE, "value": f"{data} 23:59:59"},
    ]
    where = where_and(faixa, {"field": "op_deleted", "oper": _OPER_IGUAL_OU_NULO, "value": False})
    resposta = await ctx.controllr.call_api_post(
        "/support_ctl/os/list", corpo(where, start=0, limit=200, sort="op_date_sched", dir="ASC")
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível carregar o resumo do dia.", resposta))

    login = ctx.session.username.strip().lower()
    ordens = [
        o
        for o in resposta.results
        if str(o.get("staff_username") or "").strip().lower() == login and not o.get("op_date_cancel")
    ]
    ultimo = await _ultimos_eventos(ctx, ordens) or {}
    concluidas = sum(
        1 for o in ordens if o.get("op_date_close") or _etapa_marcada(ultimo, o, 5, "op_date_finish")
    )
    return {"success": True, "total": len(ordens), "concluidas": concluidas}


class AcaoOSPayload(BaseModel):
    op_os_pk: int
    op_desc: str | None = None
    # Só no finalizar: serial para registrar o sinal na auditoria.
    onu_serial: str | None = None


def _sinal(valor: Any) -> float | None:
    return float(valor) if isinstance(valor, (int, float)) and not isinstance(valor, bool) else None


async def _leitura_sinal_onu(ctx: AuthContext, serial: str) -> dict[str, Any]:
    """Sinal lido pelo servidor na finalização; falha não impede."""
    serial = serial.strip().upper()[:40]
    leitura: dict[str, Any] = {"serial": serial}
    try:
        resposta = await ctx.controllr.onu_list(
            _corpo_busca_wizard("onu_serial", serial, sort="onu_ponid"), model_return=True, model_extended=True
        )
    except Exception:  # noqa: BLE001 — leitura é complemento, não pode derrubar a finalização
        return leitura
    if not resposta.success:
        return leitura
    for onu in resposta.results:
        dados = onu.model_dump(mode="json")
        if str(dados.get("sn") or "").strip().upper() != serial:
            continue
        rx_onu, rx_olt = _sinal(dados.get("omddm_rx_power")), _sinal(dados.get("olt_omddm_rx_power"))
        if rx_onu is not None:
            leitura["sinal_onu"] = rx_onu
        if rx_olt is not None:
            leitura["sinal_olt"] = rx_olt
        break
    return leitura


def _alvo_os(ticket_pk: int, payload: AcaoOSPayload) -> dict[str, Any]:
    alvo = {"ticket_pk": ticket_pk, "op_os_pk": payload.op_os_pk, "motivo": (payload.op_desc or "").strip()[:300]}
    return {k: v for k, v in alvo.items() if v not in (None, "")}


# Etapas da OS (set_answer/start/finish, sem doc). Cada chamada cria um evento; corpo op_os_pk + op_desc.
@router.post("/{ticket_pk}/responder")
async def responder_ordem_servico(
    ticket_pk: int, payload: AcaoOSPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo_req = corpo(None, op_os_pk=payload.op_os_pk, op_desc=payload.op_desc or "")
    resposta = await ctx.controllr.call_api_post("/support_ctl/os/set_answer", corpo_req)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível marcar a OS como respondida.", resposta))
    registrar_auditoria(request, ctx.session, "os.responder", _alvo_os(ticket_pk, payload))
    return {"success": True, "results": resposta.results}


@router.post("/{ticket_pk}/iniciar")
async def iniciar_ordem_servico(
    ticket_pk: int, payload: AcaoOSPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo_req = corpo(None, op_os_pk=payload.op_os_pk, op_desc=payload.op_desc or "")
    resposta = await ctx.controllr.call_api_post("/support_ctl/os/set_start", corpo_req)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível iniciar a OS.", resposta))
    registrar_auditoria(request, ctx.session, "os.iniciar", _alvo_os(ticket_pk, payload))
    return {"success": True, "results": resposta.results}


@router.post("/{ticket_pk}/finalizar")
async def finalizar_ordem_servico(
    ticket_pk: int, payload: AcaoOSPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo_req = corpo(None, op_os_pk=payload.op_os_pk, op_desc=payload.op_desc or "")
    resposta = await ctx.controllr.call_api_post("/support_ctl/os/set_finish", corpo_req)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível finalizar a OS.", resposta))
    alvo = _alvo_os(ticket_pk, payload)
    if payload.onu_serial and payload.onu_serial.strip():
        alvo.update(await _leitura_sinal_onu(ctx, payload.onu_serial))
    registrar_auditoria(request, ctx.session, "os.finalizar", alvo)
    return {"success": True, "results": resposta.results}


class DesfazerEtapaPayload(BaseModel):
    op_os_pk: int
    op_desc: str


# undo_answer/start/finish (sem doc): evento do mesmo tipo com data nula.
@router.post("/{ticket_pk}/desfazer-resposta")
async def desfazer_resposta_ordem_servico(
    ticket_pk: int, payload: DesfazerEtapaPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo_req = corpo(None, op_os_pk=payload.op_os_pk, op_desc=payload.op_desc)
    resposta = await ctx.controllr.call_api_post("/support_ctl/os/undo_answer", corpo_req)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível desfazer a resposta da OS.", resposta))
    registrar_auditoria(request, ctx.session, "os.desfazer_resposta", _alvo_os(ticket_pk, payload))
    return {"success": True, "results": resposta.results}


@router.post("/{ticket_pk}/desfazer-inicio")
async def desfazer_inicio_ordem_servico(
    ticket_pk: int, payload: DesfazerEtapaPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo_req = corpo(None, op_os_pk=payload.op_os_pk, op_desc=payload.op_desc)
    resposta = await ctx.controllr.call_api_post("/support_ctl/os/undo_start", corpo_req)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível desfazer o início da OS.", resposta))
    registrar_auditoria(request, ctx.session, "os.desfazer_inicio", _alvo_os(ticket_pk, payload))
    return {"success": True, "results": resposta.results}


@router.post("/{ticket_pk}/desfazer-finalizacao")
async def desfazer_finalizacao_ordem_servico(
    ticket_pk: int, payload: DesfazerEtapaPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo_req = corpo(None, op_os_pk=payload.op_os_pk, op_desc=payload.op_desc)
    resposta = await ctx.controllr.call_api_post("/support_ctl/os/undo_finish", corpo_req)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível desfazer a finalização da OS.", resposta))
    registrar_auditoria(request, ctx.session, "os.desfazer_finalizacao", _alvo_os(ticket_pk, payload))
    return {"success": True, "results": resposta.results}

