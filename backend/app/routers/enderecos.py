from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import contexto_auditoria as contexto
from ..audit import registrar_auditoria
from ..deps import AuthContext, get_auth_context
from ..http_errors import detalhe_erro

router = APIRouter(tags=["enderecos"])


class EnderecoPayload(BaseModel):
    # Obrigatórios no addresses/update: client_pk, zipcode, siafi, address e default.
    client_pk: int | None = None
    address: str | None = None
    address_number: str | None = None
    address_neighborhood: str | None = None
    address_zipcode: str | None = None
    address_province: str | None = None
    address_state: str | None = None
    address_siafi: int | None = None
    address_default: int | None = None
    address_completation: str | None = None
    address_identification: str | None = None
    # Localização do endereço (não do equipamento).
    address_latitude: str | None = None
    address_longitude: str | None = None


def _corpo(payload: EnderecoPayload, extras: dict[str, Any] | None = None) -> str:
    campos = {k: v for k, v in payload.model_dump().items() if v is not None}
    if extras:
        campos.update(extras)
    return urlencode(campos)


def _sem_vazios(alvo: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in alvo.items() if v not in (None, "", [])}


@router.put("/enderecos/{address_pk}")
async def atualizar_endereco(
    address_pk: int, payload: EnderecoPayload, request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> dict[str, Any]:
    # Como estava, lido no Controllr antes de gravar (para o antes → depois).
    antes = await contexto.endereco(ctx, address_pk)
    resposta = await ctx.controllr.address_update(_corpo(payload, {"address_pk": address_pk}))
    if not resposta.success:
        raise HTTPException(status_code=400, detail=detalhe_erro("Não foi possível atualizar o endereço.", resposta))
    depois = payload.model_dump()
    mudou = contexto.alteracoes(antes, depois, contexto.CAMPOS_ENDERECO)
    local_antes = contexto.localizacao((antes or {}).get("address_latitude"), (antes or {}).get("address_longitude"))
    local_depois = contexto.localizacao(payload.address_latitude, payload.address_longitude)
    if antes and local_depois and local_depois != local_antes:
        mudou.append({"rotulo": "Localização", "depois": local_depois, **({"antes": local_antes} if local_antes else {})})
    client_pk = payload.client_pk or (antes or {}).get("client_pk")
    registrar_auditoria(request, ctx.session, "endereco.editar", _sem_vazios({
        "client_pk": client_pk,
        "cliente": await contexto.nome_cliente(ctx, client_pk),
        "address_pk": address_pk,
        "endereco": contexto.texto_endereco({**(antes or {}), **{k: v for k, v in depois.items() if v is not None}}),
        "alteracoes": mudou,
    }))
    return {"success": True, "results": resposta.results}

