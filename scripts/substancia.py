"""
Nome de substancia -> radical tolerante a grafia — ESPELHO de lib/substancia.ts.

O Redmine escreve o medicamento como o usuario digitou ("Eltrombopag",
"Nusinersen") e o catalogo pela DCB ("ELTROMBOPAGUE OLAMINA", "NUSINERSENA").
Mesmas regras do TypeScript: sai o sal/veiculo na frente ("SUCCINATO DE"), sai
o sufixo que nao identifica a molecula ("SODICA"), fica a palavra mais longa
sem a terminacao portuguesa (vogal final, ou o "UE" de "-GUE").

Mexeu numa implementacao, mexa na outra. Casos compartilhados em
scripts/fixtures/demandas/casos_busca.json:

    python scripts/substancia.py      # autoteste (sai com 1 se divergir)
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

TAMANHO_MINIMO_RADICAL = 5
TAMANHO_PARA_RADICAL = 6

_PREFIXO_SAL = re.compile(
    r"^(?:(?:[A-ZÀ-Ü]+(?:ATO|ETO|IDRATO|ILATO)|ÓLEO|OLEO|EXTRATO|SAL)\s+DE\s+)+", re.IGNORECASE
)
_SUFIXO_SAL = re.compile(
    r"\s+(?:SÓDIC[OA]|SODIC[OA]|DISSÓDIC[OA]|DISSODIC[OA]|TRISSÓDIC[OA]|TRISSODIC[OA]|POTÁSSIC[OA]|"
    r"POTASSIC[OA]|CÁLCIC[OA]|CALCIC[OA]|MAGNÉSIC[OA]|MAGNESIC[OA]|MONOIDRATAD[OA]|DIIDRATAD[OA]|"
    r"ANIDR[OA]|RECOMBINANTE|HUMAN[OA])$",
    re.IGNORECASE,
)


def sem_acento(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if not unicodedata.combining(ch))


def limpar_substancia(bruta: str) -> str:
    s = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", bruta)).strip()
    s = _PREFIXO_SAL.sub("", s)
    anterior = None
    while anterior != s:
        anterior = s
        s = _SUFIXO_SAL.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def radical_palavra(palavra: str) -> str:
    p = palavra.upper()
    if len(p) < TAMANHO_PARA_RADICAL:
        return p
    if p.endswith("GUE"):
        return p[:-2]
    if p[-1:] in ("A", "E", "O"):
        return p[:-1]
    return p


def radical_substancia(limpa: str) -> str | None:
    palavras = re.findall(r"[A-ZÀ-Ü0-9]+", limpa.upper())
    if not palavras:
        return None
    maior = palavras[0]
    for p in palavras[1:]:
        if len(p) > len(maior):
            maior = p
    r = radical_palavra(maior)
    return r if len(r) >= TAMANHO_MINIMO_RADICAL else None


def grupo_de_substancia(bruta: str) -> dict | None:
    partes = [p for p in (limpar_substancia(x) for x in re.split(r"[;+/]", bruta)) if p]
    termos: list[str] = []
    for parte in partes:
        r = radical_substancia(parte)
        if r and r not in termos:
            termos.append(r)
    return {"rotulo": " + ".join(partes), "termos": termos} if termos else None


def substancia_principal(descricao: str) -> str:
    m = re.search(r"PRINC[IÍ]PIO ATIVO:\s*([^,]+)", descricao, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return descricao.split(",")[0].split(" — ")[0].strip()


def _autoteste() -> int:
    casos = json.loads((Path(__file__).parent / "fixtures" / "demandas" / "casos_busca.json").read_text(encoding="utf-8"))
    erros = 0
    for entrada, esperado in casos["radicalSubstancia"]:
        r = radical_substancia(limpar_substancia(entrada))
        if r != esperado:
            erros += 1
            print(f"  ERRO radical {entrada!r}: {r!r} != {esperado!r}")
    for entrada, esperado in casos["grupoDeSubstancia"]:
        r = grupo_de_substancia(entrada)
        if r != esperado:
            erros += 1
            print(f"  ERRO grupo {entrada!r}: {r!r} != {esperado!r}")
    total = len(casos["radicalSubstancia"]) + len(casos["grupoDeSubstancia"])
    print(f"substancia.py: {total - erros}/{total} caso(s) conferem com casos_busca.json")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(_autoteste())
