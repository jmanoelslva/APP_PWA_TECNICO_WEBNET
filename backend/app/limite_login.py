"""Limite de logins errados, em memória: por IP+usuário, por IP e por usuário. IPv6 conta pelo /64."""

import ipaddress
import threading
import time

from .config import LOGIN_BLOQUEIO_MINUTOS, LOGIN_TENTATIVAS_IP, LOGIN_TENTATIVAS_PAR, LOGIN_TENTATIVAS_USUARIO

_lock = threading.Lock()
_falhas: dict[str, list[float]] = {}


_LIMPEZA_A_CADA = 500
_desde_limpeza = 0


def origem(ip: str) -> str:
    """IPv4 inteiro; IPv6 pelo /64."""
    try:
        endereco = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(endereco, ipaddress.IPv6Address):
        if endereco.ipv4_mapped is not None:
            return str(endereco.ipv4_mapped)
        return str(ipaddress.ip_network(f"{endereco}/64", strict=False))
    return str(endereco)


def _chave_par(ip: str, usuario: str) -> str:
    return f"par:{origem(ip)}|{usuario.strip().lower()}"


def _chave_ip(ip: str) -> str:
    return f"ip:{origem(ip)}"


def _chave_usuario(usuario: str) -> str:
    return f"usuario:{usuario.strip().lower()}"


def _recentes(chave: str, agora: float) -> list[float]:
    janela = LOGIN_BLOQUEIO_MINUTOS * 60
    falhas = [t for t in _falhas.get(chave, []) if agora - t < janela]
    if falhas:
        _falhas[chave] = falhas
    else:
        _falhas.pop(chave, None)
    return falhas


def bloqueado(ip: str, usuario: str) -> bool:
    agora = time.monotonic()
    with _lock:
        return (len(_recentes(_chave_par(ip, usuario), agora)) >= LOGIN_TENTATIVAS_PAR
                or len(_recentes(_chave_ip(ip), agora)) >= LOGIN_TENTATIVAS_IP
                or len(_recentes(_chave_usuario(usuario), agora)) >= LOGIN_TENTATIVAS_USUARIO)


def falhou(ip: str, usuario: str) -> None:
    global _desde_limpeza
    agora = time.monotonic()
    with _lock:
        for chave in (_chave_par(ip, usuario), _chave_ip(ip), _chave_usuario(usuario)):
            _falhas.setdefault(chave, []).append(agora)
        _desde_limpeza += 1
        if _desde_limpeza >= _LIMPEZA_A_CADA:
            _desde_limpeza = 0
            for chave in list(_falhas):
                _recentes(chave, agora)


def acertou(ip: str, usuario: str) -> None:
    # Login certo zera só o par IP+usuário.
    with _lock:
        _falhas.pop(_chave_par(ip, usuario), None)
