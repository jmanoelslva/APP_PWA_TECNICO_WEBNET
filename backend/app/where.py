"""Filtro "where" do Controllr. Operadores: 5 =, 7 IS, 8 IS NOT, 9 LIKE, 10 ILIKE, 21 IN."""

import json
from typing import Any
from urllib.parse import urlencode

OPER_EQ = 5
OPER_ILIKE = 10
OPER_IN = 21
OPER_GTE = 4
OPER_LTE = 3
OPER_IS = 7
OPER_IS_NOT = 8


def where_json(condicoes: list[Any]) -> str:
    return json.dumps(condicoes, separators=(",", ":"))


def where_eq(field: str, value: Any) -> str:
    return where_json([{"field": field, "oper": OPER_EQ, "value": value}])


def where_in(field: str, values: list[Any]) -> str:
    return where_json([{"field": field, "oper": OPER_IN, "value": values}])


def where_and(*condicoes: dict[str, Any] | list[Any]) -> str:
    """Condições com AND explícito; uma condição pode ser lista (grupo, ex.: faixa de data)."""
    combinado: list[Any] = []
    for i, condicao in enumerate(condicoes):
        if i > 0:
            combinado.append({"field": "AND"})
        combinado.append(condicao)
    return where_json(combinado)


def corpo(where: str | None = None, **campos: Any) -> str:
    """Corpo urlencoded com "where" codificado; "%" cru faz o Controllr ignorar o filtro."""
    partes: dict[str, Any] = dict(campos)
    if where is not None:
        partes["where"] = where
    return urlencode(partes)
