"""Vigia de OS nova: consulta periódica com usuário próprio e avisa o técnico responsável. "Vista" = OS + técnico. Na
1ª vez só memoriza."""

import asyncio
import logging
from collections import defaultdict
from typing import Any

from . import avisos, sessions
from .brbyteapi.controllr import AsyncControllr
from .brbyteapi.controllr.login import ControllrLogin
from .config import (
    AVISOS_INTERVALO_SEGUNDOS,
    CONTROLLR_CONSULTA_SENHA,
    CONTROLLR_CONSULTA_USUARIO,
    CONTROLLR_URL,
)
from .deps import encerrar_sessao_controllr
from .routers.ordens_servico import _condicoes_abertas
from .where import corpo, where_and

logger = logging.getLogger(__name__)

_POR_PAGINA = 500
_MAX_PAGINAS = 20
# Acima disto, um aviso só com a quantidade.
_MAX_AVISOS_SEPARADOS = 3
# Login recusado: espera mais para não bloquear a conta.
_ESPERA_APOS_LOGIN_RECUSADO_S = 600
# Nome do cookie do vigia no store de sessões (sobrevive a reinício).
_EXTRA_COOKIE = "vigia_os_cookie"


def configurado() -> bool:
    return bool(CONTROLLR_CONSULTA_USUARIO and CONTROLLR_CONSULTA_SENHA and avisos.configurado())


def _chave(os_: dict[str, Any]) -> str | None:
    tecnico = str(os_.get("staff_username") or "").strip().lower()
    if not tecnico or os_.get("op_pk") is None:
        return None
    return f"{os_['op_pk']}:{tecnico}"


async def _os_abertas(controllr: AsyncControllr) -> list[dict[str, Any]] | None:
    """Todas as OS em aberto (todas as páginas), ou None se o Controllr falhar."""
    ordens: list[dict[str, Any]] = []
    for pagina in range(_MAX_PAGINAS):
        resposta = await controllr.call_api_post(
            "/support_ctl/os/list",
            corpo(where_and(*_condicoes_abertas()), start=pagina * _POR_PAGINA, limit=_POR_PAGINA,
                  sort="op_pk", dir="ASC"),
        )
        if not resposta.success:
            logger.warning("Vigia de OS: Controllr recusou a lista (%s)", getattr(resposta, "errors", None))
            return None
        ordens.extend(resposta.results)
        total = resposta.total
        if len(resposta.results) < _POR_PAGINA or (total and len(ordens) >= total):
            return ordens
    logger.warning("Vigia de OS: mais de %s OS em aberto; vendo só as primeiras", _POR_PAGINA * _MAX_PAGINAS)
    return ordens


async def verificar(ordens: list[dict[str, Any]]) -> int:
    """Compara com as já vistas, avisa das novas e grava. Devolve quantos avisos saíram."""
    atuais = {chave: os_ for os_ in ordens if (chave := _chave(os_))}
    vistas = avisos.ler_vistas()
    if vistas is None:
        avisos.gravar_vistas(set(atuais))
        logger.info("Vigia de OS: primeira execução, %s OS em aberto memorizadas sem avisar", len(atuais))
        return 0

    ja_vistas = set(vistas.get("chaves", []))
    novas_por_tecnico: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for chave, os_ in atuais.items():
        if chave not in ja_vistas:
            novas_por_tecnico[chave.split(":", 1)[1]].append(os_)

    enviados = 0
    for tecnico, novas in novas_por_tecnico.items():
        if not avisos.inscricoes_de(tecnico):
            continue
        if len(novas) > _MAX_AVISOS_SEPARADOS:
            aviso = {"titulo": "Novas OS", "corpo": f"{len(novas)} OS novas para você.", "url": "/suporte",
                     "tag": "os-varias"}
            enviados += await avisos.enviar_para(tecnico, aviso)
        else:
            for os_ in novas:
                enviados += await avisos.enviar_para(tecnico, avisos.texto_os(os_))

    # Só as que continuam em aberto: OS fechada sai da lista e do arquivo.
    avisos.gravar_vistas(set(atuais))
    return enviados


async def rodar() -> None:
    """Laço do vigia, até o serviço parar."""
    # Reusa o cookie guardado; se caiu, a 1ª consulta falha e loga de novo.
    cookie: str | None = sessions.ler_extra(_EXTRA_COOKIE)
    logger.info("Vigia de OS ligado: a cada %ss, usuário de consulta %r",
                AVISOS_INTERVALO_SEGUNDOS, CONTROLLR_CONSULTA_USUARIO)
    try:
        while True:
            espera = AVISOS_INTERVALO_SEGUNDOS
            try:
                if cookie is None:
                    login = await ControllrLogin.login(CONTROLLR_URL, CONTROLLR_CONSULTA_USUARIO, CONTROLLR_CONSULTA_SENHA)
                    if not login.success or not login.cookie_header:
                        logger.error("Vigia de OS: login do usuário de consulta recusado pelo Controllr")
                        espera = _ESPERA_APOS_LOGIN_RECUSADO_S
                    else:
                        cookie = login.cookie_header
                        sessions.guardar_extra(_EXTRA_COOKIE, cookie)
                if cookie is not None:
                    ordens = await _os_abertas(AsyncControllr(cookie=cookie, server_url=CONTROLLR_URL))
                    if ordens is None:
                        # Sessão pode ter caído: entra de novo na próxima volta.
                        await encerrar_sessao_controllr(CONTROLLR_CONSULTA_USUARIO, cookie)
                        cookie = None
                        sessions.guardar_extra(_EXTRA_COOKIE, None)
                    else:
                        enviados = await verificar(ordens)
                        if enviados:
                            logger.info("Vigia de OS: %s aviso(s) enviado(s)", enviados)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Vigia de OS: erro nesta volta, tentando de novo na próxima")
                if cookie is not None:
                    await encerrar_sessao_controllr(CONTROLLR_CONSULTA_USUARIO, cookie)
                cookie = None
                sessions.guardar_extra(_EXTRA_COOKIE, None)
            await asyncio.sleep(espera)
    finally:
        # Sem sessões persistentes, sai do Controllr.
        if cookie is not None and not sessions.persistente():
            await encerrar_sessao_controllr(CONTROLLR_CONSULTA_USUARIO, cookie)
