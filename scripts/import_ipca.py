#!/usr/bin/env python3
"""
Carga do IPCA mensal (IBGE/SIDRA, tabela 1737) em public."IndiceIpca", para a
atualização monetária da Pesquisa de Preços (D2 da avaliação da DLOG).

  * variável 2266 = IPCA — número-índice (base: dezembro de 1993 = 100);
  * variável 63   = IPCA — variação mensal (%).
Os ids são conferidos no cabeçalho que a própria API devolve: se o nome da
variável não bater, o script aborta sem gravar.

Autoteste (sempre roda): para cada par de meses consecutivos, o produto
(1 + variação/100) tem de bater com a razão dos números-índices (tolerância de
0,1%). É o que garante que o painel usa o fator COMPOSTO, e não a soma das
variações (o erro 1 da planilha original).

UPSERT por competência; cria a tabela se ausente (mesma DDL do `prisma db push`).

Uso:
    python scripts/import_ipca.py --dry-run
    python scripts/import_ipca.py --confirm
    python scripts/import_ipca.py --file ipca_sidra.json --dry-run   # arquivo baixado à mão
      (o JSON de /values/t/1737/n1/all/v/2266,63/p/all, ou um CSV "AAAA-MM;numero_indice;variacao")
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

URL_SIDRA = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266,63/p/all"
TOLERANCIA = 0.001

DDL = """
CREATE TABLE IF NOT EXISTS public."IndiceIpca" (
    "competencia" DATE NOT NULL,
    "numeroIndice" DOUBLE PRECISION NOT NULL,
    "variacaoMensal" DOUBLE PRECISION,
    "fonte" TEXT NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndiceIpca_pkey" PRIMARY KEY ("competencia")
);
"""


def _num(v) -> float | None:
    s = str(v or "").strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None  # "...", "-", "X" = sem valor


def ler_sidra(dados: list[dict]) -> dict[str, dict]:
    """JSON do SIDRA: a 1ª linha é o cabeçalho (D1C, D1N, D2C, D2N, D3C, D3N, V…)."""
    cab, *linhas = dados
    # Descobre qual dimensão é a variável e qual é o mês pelo cabeçalho.
    dims = {k: str(v) for k, v in cab.items()}
    chave_var = next((k[:-1] for k, v in dims.items() if k.endswith("C") and "Variável" in v), None)
    chave_mes = next((k[:-1] for k, v in dims.items() if k.endswith("C") and ("Mês" in v or "Mes" in v)), None)
    if not chave_var or not chave_mes:
        raise SystemExit(f"Cabeçalho do SIDRA inesperado: {cab}")
    meses: dict[str, dict] = {}
    for l in linhas:
        var = str(l.get(f"{chave_var}C"))
        nome = str(l.get(f"{chave_var}N", ""))
        mes = str(l.get(f"{chave_mes}C"))  # "202607"
        if len(mes) != 6:
            continue
        chave = f"{mes[:4]}-{mes[4:]}"
        reg = meses.setdefault(chave, {"numeroIndice": None, "variacaoMensal": None})
        if var == "2266":
            if "número-índice" not in nome.lower() and "numero-indice" not in nome.lower():
                raise SystemExit(f"Variável 2266 não é o número-índice: {nome!r} — ids do SIDRA mudaram")
            reg["numeroIndice"] = _num(l.get("V"))
        elif var == "63":
            if "variação mensal" not in nome.lower() and "variacao mensal" not in nome.lower():
                raise SystemExit(f"Variável 63 não é a variação mensal: {nome!r} — ids do SIDRA mudaram")
            reg["variacaoMensal"] = _num(l.get("V"))
    return {k: v for k, v in meses.items() if v["numeroIndice"] is not None}


def ler_csv(texto: str) -> dict[str, dict]:
    meses = {}
    for linha in csv.reader(io.StringIO(texto), delimiter=";"):
        if len(linha) < 2 or not linha[0][:4].isdigit():
            continue
        ni = _num(linha[1])
        if ni is None:
            continue
        meses[linha[0][:7]] = {"numeroIndice": ni, "variacaoMensal": _num(linha[2]) if len(linha) > 2 else None}
    return meses


def autoteste(meses: dict[str, dict]) -> list[str]:
    erros = []
    chaves = sorted(meses)
    for a, b in zip(chaves, chaves[1:]):
        va = meses[b]["variacaoMensal"]
        if va is None:
            continue
        razao = meses[b]["numeroIndice"] / meses[a]["numeroIndice"]
        if abs(razao - (1 + va / 100)) > TOLERANCIA:
            erros.append(f"{b}: índice/índice anterior = {razao:.6f}, 1 + variação = {1 + va / 100:.6f}")
    return erros


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--file", type=Path, help="JSON do SIDRA ou CSV baixado à mão (sem ele, consulta a API)")
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--dry-run", action="store_true")
    grupo.add_argument("--confirm", action="store_true")
    args = ap.parse_args()

    if args.file:
        texto = args.file.read_text(encoding="utf-8-sig")
        meses = ler_sidra(json.loads(texto)) if texto.lstrip().startswith("[") else ler_csv(texto)
        fonte = f"arquivo {args.file.name}"
    else:
        import requests

        r = requests.get(URL_SIDRA, timeout=120)  # TLS verificado (padrão)
        r.raise_for_status()
        meses = ler_sidra(r.json())
        fonte = "IBGE/SIDRA 1737"

    if not meses:
        print("Nenhum mês lido.")
        return 1
    chaves = sorted(meses)
    erros = autoteste(meses)
    print(f"{len(meses)} mês(es): {chaves[0]} a {chaves[-1]} · último índice {meses[chaves[-1]]['numeroIndice']}")
    if erros:
        print(f"AUTOTESTE FALHOU ({len(erros)}):")
        for e in erros[:10]:
            print("  ", e)
        return 1
    print("autoteste: produto das variações confere com a razão dos números-índices (tolerância de 0,1%)")
    for k in chaves[-3:]:
        print(f"  {k}: índice {meses[k]['numeroIndice']}, variação {meses[k]['variacaoMensal']}%")

    if args.dry_run:
        print("--dry-run: nada gravado.")
        return 0

    import psycopg
    from import_redmine_base import load_database_url

    with psycopg.connect(load_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.executemany(
                'INSERT INTO public."IndiceIpca" ("competencia", "numeroIndice", "variacaoMensal", "fonte") '
                "VALUES (%s, %s, %s, %s) ON CONFLICT (competencia) DO UPDATE SET "
                '"numeroIndice" = EXCLUDED."numeroIndice", "variacaoMensal" = EXCLUDED."variacaoMensal", '
                '"fonte" = EXCLUDED."fonte", "importadoEm" = CURRENT_TIMESTAMP',
                [(f"{k}-01", v["numeroIndice"], v["variacaoMensal"], fonte) for k, v in sorted(meses.items())],
            )
        conn.commit()
    print(f'{len(meses)} mês(es) gravados em public."IndiceIpca".')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
