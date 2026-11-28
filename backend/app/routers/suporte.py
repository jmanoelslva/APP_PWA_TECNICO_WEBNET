"""Ticket (chamado do cliente) e seu chat. O técnico não fecha ticket; fecha a OS."""

import asyncio
import logging
from typing import Any
from urllib.parse import quote, urlencode

import aiohttp
from aiohttp import FormData
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel

from ..config import ANEXO_MAX_MB, CONTROLLR_URL
from ..deps import AuthContext, get_auth_context
from ..http_errors import detalhe_erro
from ..where import corpo as montar_corpo
from ..where import where_eq

router = APIRouter(prefix="/suporte", tags=["suporte"])
logger = logging.getLogger(__name__)


@router.get("/tickets/{ticket_pk}")
async def detalhe_ticket(ticket_pk: int, ctx: AuthContext = Depends(get_auth_context)) -> dict[str, Any]:
    resposta = await ctx.controllr.ticket_list(montar_corpo(where_eq("ticket_pk", ticket_pk), limit=1))
    if not resposta.success or not resposta.results:
        raise HTTPException(status_code=404, detail="Chamado não encontrado.")
    return {"success": True, "ticket": resposta.results[0]}


@router.get("/tickets/{ticket_pk}/mensagens")
async def listar_mensagens_ticket(ticket_pk: int, ctx: AuthContext = Depends(get_auth_context)) -> dict[str, Any]:
    # support_ctl/op/list não tem wrapper no brbyteapi (só op/create).
    resposta = await ctx.controllr.call_api_post(
        # limit explícito: sem ele o Controllr pode cortar o chat na 1ª página.
        "/support_ctl/op/list", montar_corpo(where_eq("ticket_pk", ticket_pk), start=0, limit=1000)
    )
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível listar as mensagens do chamado.", resposta))
    return {"success": True, "results": resposta.results}


class MensagemPayload(BaseModel):
    op_desc: str


@router.post("/tickets/{ticket_pk}/mensagens")
async def criar_mensagem_ticket(
    ticket_pk: int, payload: MensagemPayload, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    corpo = urlencode({"ticket_pk": ticket_pk, "op_type": 0, "op_code": 0, "op_desc": payload.op_desc})
    resposta = await ctx.controllr.support_op_create(corpo)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível enviar a mensagem.", resposta))
    return {"success": True, "results": resposta.results}


# Até 3 anexos em memória ao mesmo tempo.
_ENVIOS_ANEXO = asyncio.Semaphore(3)


async def _ler_anexo(file: UploadFile) -> bytes:
    """Lê o anexo em pedaços e recusa (413) o que passar de ANEXO_MAX_MB."""
    limite = ANEXO_MAX_MB * 1024 * 1024
    partes: list[bytes] = []
    total = 0
    while pedaco := await file.read(1024 * 1024):
        total += len(pedaco)
        if total > limite:
            raise HTTPException(status_code=413, detail=f"Anexo maior que {ANEXO_MAX_MB} MB.")
        partes.append(pedaco)
    return b"".join(partes)


@router.post("/tickets/{ticket_pk}/anexos")
async def enviar_anexo_ticket(
    ticket_pk: int, file: UploadFile, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    async with _ENVIOS_ANEXO:
        conteudo = await _ler_anexo(file)
        form = FormData()
        form.add_field("file", conteudo, filename=file.filename, content_type=file.content_type)
        form.add_field("ticket_pk", str(ticket_pk))

        resposta = await ctx.controllr.support_annex_upload(form)
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível enviar o anexo.", resposta))
    return {"success": True, "results": resposta.results}


# Mesmo domínio do app: só abre na tela o que não executa script; o resto vai como download.
def _abre_na_tela(tipo: str) -> bool:
    if tipo.startswith("image/"):
        return not tipo.startswith("image/svg")
    return tipo.startswith(("video/", "audio/")) or tipo == "application/pdf"


def _tipo_pela_assinatura(inicio: bytes) -> str | None:
    """Confere o tipo pelos primeiros bytes. HTML, SVG e HEIC não."""
    if inicio.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if inicio.startswith(b"\x89PNG"):
        return "image/png"
    if inicio.startswith(b"GIF8"):
        return "image/gif"
    if inicio[:4] == b"RIFF" and inicio[8:12] == b"WEBP":
        return "image/webp"
    if inicio.startswith(b"BM"):
        return "image/bmp"
    if inicio.startswith(b"%PDF"):
        return "application/pdf"
    # MP4/MOV/3GP: "ftyp" na posição 4 (HEIC também usa ftyp, mas não é vídeo).
    if inicio[4:8] == b"ftyp" and inicio[8:12] not in (b"heic", b"heix", b"mif1", b"msf1"):
        return "video/quicktime" if inicio[8:12] == b"qt  " else "video/mp4"
    if inicio.startswith(b"\x1aE\xdf\xa3"):
        return "video/webm"
    return None


ANEXO_VER_MAX_BYTES = max(ANEXO_MAX_MB, 50) * 1024 * 1024


@router.get("/tickets/{ticket_pk}/anexos/{arquivo}")
async def visualizar_anexo_ticket(
    ticket_pk: int, arquivo: str, ctx: AuthContext = Depends(get_auth_context)
) -> FastAPIResponse:
    if arquivo in (".", "..") or "\\" in arquivo:
        raise HTTPException(status_code=400, detail="Nome de anexo inválido.")
    # annex/view sem wrapper: proxy com o cookie do técnico.
    url = f"{CONTROLLR_URL}/support_ctl/annex/view/{ticket_pk}/{quote(arquivo, safe='')}"
    # Teto de 60 s e ANEXO_VER_MAX_BYTES.
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
            async with session.get(url, headers={"Cookie": ctx.session.controllr_cookie}) as resposta:
                pedacos: list[bytes] = []
                lidos = 0
                async for pedaco in resposta.content.iter_chunked(64 * 1024):
                    pedacos.append(pedaco)
                    lidos += len(pedaco)
                    if lidos > ANEXO_VER_MAX_BYTES:
                        break
                conteudo = b"".join(pedacos)
                status = resposta.status
                tipo = resposta.headers.get("Content-Type", "application/octet-stream")
    except (aiohttp.ClientError, asyncio.TimeoutError):
        logger.warning("Anexo %s/%s: Controllr não respondeu a tempo", ticket_pk, arquivo)
        raise HTTPException(status_code=504, detail="O anexo demorou demais para carregar. Tente de novo.")
    if len(conteudo) > ANEXO_VER_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Anexo grande demais para abrir no app.")
    if status >= 400:
        # Não repassa o código: um 401 dele deslogaria o técnico.
        logger.warning("Anexo %s/%s: Controllr respondeu HTTP %s", ticket_pk, arquivo, status)
        raise HTTPException(
            status_code=404 if status == 404 else 502,
            detail="Não foi possível carregar o anexo.",
        )

    base = tipo.split(";")[0].strip().lower()
    cabecalhos = {"X-Content-Type-Options": "nosniff"}
    if _abre_na_tela(base):
        return FastAPIResponse(content=conteudo, media_type=tipo, headers=cabecalhos)
    tipo_real = _tipo_pela_assinatura(conteudo[:16])
    if tipo_real:
        return FastAPIResponse(content=conteudo, media_type=tipo_real, headers=cabecalhos)
    cabecalhos["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(arquivo, safe='')}"
    # Se mesmo assim o navegador abrir, a página fica isolada e sem script.
    cabecalhos["Content-Security-Policy"] = "sandbox; default-src 'none'"
    return FastAPIResponse(content=conteudo, media_type="application/octet-stream", headers=cabecalhos)
