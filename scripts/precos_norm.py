"""
Normalizacoes da Pesquisa de Precos — ESPELHO de lib/pesquisa-preco.ts.

As colunas "descricaoNorm" (CatmatItem) e "unidadeNorm" (CmedRegistro) sao
gravadas pelos importadores Python e comparadas em runtime com o resultado das
funcoes TypeScript normalizarTexto/normalizarUnidade. Qualquer mudanca em uma
das implementacoes precisa ser replicada na outra (e a base reimportada).

    python scripts/precos_norm.py   # roda os exemplos de auto-verificacao
"""

from __future__ import annotations

import re
import unicodedata


def _sem_acentos(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if not unicodedata.combining(ch))


def normalizar_texto(texto: str | None) -> str:
    """Sem acentos, minusculas, apenas [a-z0-9 ,-]; espacos colapsados."""
    s = _sem_acentos(str(texto or "")).lower()
    s = re.sub(r"[^a-z0-9\s,\-]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalizar_unidade(unidade: str | None) -> str:
    """Unidade de fornecimento comparavel entre fontes (idempotente)."""
    if not unidade:
        return ""
    s = re.sub(r"\s+", " ", _sem_acentos(str(unidade)).upper()).strip()
    s = re.sub(r"\s*-\s*GENERICO$", "", s)

    def _dec(m: re.Match[str]) -> str:
        d = m.group(2).rstrip("0")
        return f"{m.group(1)},{d}" if d else m.group(1)

    s = re.sub(r"(\d+),(\d+)", _dec, s)
    s = re.sub(r"\s0$", "", s)
    return re.sub(r"\s+", " ", s).strip()


EXEMPLOS_UNIDADE = {
    "Frasco 100,00 ML": "FRASCO 100 ML",
    "FRASCO 100 ML": "FRASCO 100 ML",
    "SERINGA 0,40 ML": "SERINGA 0,4 ML",
    "COMPRIMIDO - GENÉRICO": "COMPRIMIDO",
    "UNIDADE 0,00": "UNIDADE",
    "Cápsula": "CAPSULA",
    "": "",
}

EXEMPLOS_TEXTO = {
    "AZITROMICINA, DOSAGEM:500 MG": "azitromicina, dosagem 500 mg",
    "Ácido Fólico 5 mg/mL": "acido folico 5 mg ml",
}

if __name__ == "__main__":
    ok = True
    for entrada, esperado in EXEMPLOS_UNIDADE.items():
        got = normalizar_unidade(entrada)
        passou = got == esperado and normalizar_unidade(got) == got
        ok = ok and passou
        print(f"  unidade {entrada!r:28} -> {got!r:20} {'OK' if passou else 'ERRO (esperado ' + repr(esperado) + ')'}")
    for entrada, esperado in EXEMPLOS_TEXTO.items():
        got = normalizar_texto(entrada)
        passou = got == esperado
        ok = ok and passou
        print(f"  texto   {entrada!r:28} -> {got!r:20} {'OK' if passou else 'ERRO (esperado ' + repr(esperado) + ')'}")
    raise SystemExit(0 if ok else 1)
