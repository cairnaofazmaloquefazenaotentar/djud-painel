"""
Coluna "buscaNorm" e NUP SEI das demandas — ESPELHO de lib/demandas-filtro-tipos.ts
(montarBuscaNorm, normalizarNupSei).

Gravadas pelo importador do Redmine (scripts/import_redmine_base.py), pelo
scripts/alter_demanda_busca.py (carga inicial) e pelo enriquecimento (A5); as
rotas POST/PATCH de demanda gravam a versao TypeScript. As duas tem de dar o
MESMO texto, senao a busca acharia a demanda por um caminho e nao pelo outro.

    python scripts/demandas_busca.py    # autoteste contra casos_busca.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from precos_norm import normalizar_texto  # noqa: E402

_NUP = re.compile(r"(\d{5})[.\s]?(\d{5,6})/?(\d{4})-?(\d{1,2})")


def digitos(s) -> str:
    return re.sub(r"\D", "", str(s or ""))


def normalizar_nup_sei(bruto) -> str | None:
    """Formato canonico "25000.123456/2021-11" (o mesmo do cruzamento com o SISMAT)."""
    m = _NUP.search(str(bruto or ""))
    return f"{m.group(1)}.{m.group(2)}/{m.group(3)}-{m.group(4)}" if m else None


def montar_busca_norm(d: dict) -> str:
    """Campos normalizados + os digitos do processo e do NUP, na ordem do TS."""
    partes = [
        d.get("numero"),
        d.get("numeroProcesso"),
        digitos(d.get("numeroProcesso")),
        d.get("nupSei"),
        digitos(d.get("nupSei")),
        d.get("titulo"),
        d.get("principioAtivo"),
        d.get("medicamento"),
        d.get("descricao"),
    ]
    return " ".join(p for p in (normalizar_texto(x) for x in partes) if p)


def _autoteste() -> int:
    casos = json.loads((Path(__file__).parent / "fixtures" / "demandas" / "casos_busca.json").read_text(encoding="utf-8"))
    erros = 0
    for entrada, esperado in casos["nupSei"]:
        r = normalizar_nup_sei(entrada)
        if r != esperado:
            erros += 1
            print(f"  ERRO nup {entrada!r}: {r!r} != {esperado!r}")
    for entrada, esperado in casos["buscaNorm"]:
        r = montar_busca_norm(entrada)
        if r != esperado:
            erros += 1
            print(f"  ERRO buscaNorm: {r!r}\n            != {esperado!r}")
    total = len(casos["nupSei"]) + len(casos["buscaNorm"])
    print(f"demandas_busca.py: {total - erros}/{total} caso(s) conferem com casos_busca.json")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(_autoteste())
