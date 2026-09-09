#!/usr/bin/env python3
"""
Importador do catalogo CATMAT (16 classes da saude, xlsx) -> tabela "CatmatItem".

Alimenta os filtros obrigatorios "Codigo do material" e "Descricao CATMAT" da
Pesquisa de Precos. Python (e nao TS) pelo mesmo motivo de
import_redmine_base.py: a carga vai por COPY e nao depende de node_modules.

Planilha esperada ("Catmats - 16 Classes - DD.MM.AAAA.xlsx"), aba unica, com
cabecalho: codigoGrupo, nomeGrupo, codigoClasse, nomeClasse, codigoPdm,
nomePdm, codigoItem, descricaoItem, codigoNcm (a ordem das colunas nao importa).

Modo de operacao: REPLACE (espelho exato da planilha). A tabela e criada se
nao existir, com a MESMA DDL que `prisma db push` geraria a partir de
prisma/schema.prisma (model CatmatItem) — um db:push posterior e no-op.

Uso:
    python scripts/import_catmat_classes.py --file "Catmats - 16 Classes - 09.09.2026.xlsx" --dry-run
    python scripts/import_catmat_classes.py --file "Catmats - 16 Classes - 09.09.2026.xlsx" --confirm
"""

from __future__ import annotations

import argparse
import glob
import re
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402
from precos_norm import normalizar_texto  # noqa: E402

TABELA = '"CatmatItem"'

COLUMNS = [
    "codigoItem", "descricaoItem", "descricaoNorm", "codigoPdm", "nomePdm",
    "codigoClasse", "nomeClasse", "codigoGrupo", "nomeGrupo", "codigoNcm",
]

HEADERS_OBRIGATORIOS = [
    "codigoGrupo", "nomeGrupo", "codigoClasse", "nomeClasse",
    "codigoPdm", "nomePdm", "codigoItem", "descricaoItem",
]

# DDL identica a de prisma/schema.prisma (model CatmatItem) — ver comentario la.
DDL = """
CREATE TABLE IF NOT EXISTS public."CatmatItem" (
    "codigoItem"    TEXT NOT NULL,
    "descricaoItem" TEXT NOT NULL,
    "descricaoNorm" TEXT NOT NULL,
    "codigoPdm"     TEXT NOT NULL,
    "nomePdm"       TEXT NOT NULL,
    "codigoClasse"  TEXT NOT NULL,
    "nomeClasse"    TEXT NOT NULL,
    "codigoGrupo"   TEXT NOT NULL,
    "nomeGrupo"     TEXT NOT NULL,
    "codigoNcm"     TEXT,
    "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatmatItem_pkey" PRIMARY KEY ("codigoItem")
);
CREATE INDEX IF NOT EXISTS "CatmatItem_codigoClasse_idx" ON public."CatmatItem"("codigoClasse");
CREATE INDEX IF NOT EXISTS "CatmatItem_nomePdm_idx" ON public."CatmatItem"("nomePdm");
"""


def _txt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def _codigo(v) -> str:
    """Codigo numerico como string sem zeros a esquerda (mesma regra de classificarCodigo no TS)."""
    d = re.sub(r"\D", "", _txt(v))
    return d.lstrip("0") or ("0" if d else "")


def iter_registros(path: str, limit: int | None, stats: Counter):
    """Le a planilha em streaming e gera dicts prontos para o COPY."""
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    header = [_txt(h) for h in next(rows)]
    idx = {h: i for i, h in enumerate(header)}
    faltando = [h for h in HEADERS_OBRIGATORIOS if h not in idx]
    if faltando:
        sys.exit(f"ERRO: cabecalho sem as colunas {faltando}. Encontrado: {header}")

    def get(row, h: str) -> str:
        i = idx.get(h)
        return _txt(row[i]) if i is not None and i < len(row) else ""

    vistos: set[str] = set()
    for row in rows:
        stats["lidas"] += 1
        codigo = _codigo(get(row, "codigoItem"))
        descricao = get(row, "descricaoItem")
        if not codigo or not descricao:
            stats["descartadas_sem_codigo_ou_descricao"] += 1
            continue
        if codigo in vistos:
            stats["duplicadas"] += 1
            continue
        vistos.add(codigo)
        stats["emitidas"] += 1
        yield {
            "codigoItem": codigo,
            "descricaoItem": descricao,
            "descricaoNorm": normalizar_texto(descricao),
            "codigoPdm": _codigo(get(row, "codigoPdm")),
            "nomePdm": get(row, "nomePdm"),
            "codigoClasse": _codigo(get(row, "codigoClasse")),
            "nomeClasse": get(row, "nomeClasse"),
            "codigoGrupo": _codigo(get(row, "codigoGrupo")),
            "nomeGrupo": get(row, "nomeGrupo"),
            "codigoNcm": get(row, "codigoNcm") or None,
        }
        if limit and stats["emitidas"] >= limit:
            break
    wb.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", help="planilha xlsx (padrao: 'Catmats - 16 Classes - *.xlsx' mais recente)")
    ap.add_argument("--dry-run", action="store_true", help="valida sem tocar no banco")
    ap.add_argument("--confirm", action="store_true", help="executa a carga (REPLACE)")
    ap.add_argument("--limit", type=int, default=0, help="processa apenas N itens")
    args = ap.parse_args()

    if not args.dry_run and not args.confirm:
        ap.error("informe --dry-run ou --confirm")

    arquivo = args.file
    if not arquivo:
        candidatos = sorted(glob.glob("Catmats - 16 Classes - *.xlsx"))
        if not candidatos:
            sys.exit("ERRO: informe --file (nenhuma 'Catmats - 16 Classes - *.xlsx' na pasta atual)")
        arquivo = candidatos[-1]
    xlsx = Path(arquivo)
    if not xlsx.exists():
        sys.exit(f"ERRO: planilha nao encontrada: {xlsx}")

    limit = args.limit or None
    print("")
    print(f"  planilha .. {xlsx.name}  ({xlsx.stat().st_size / 1e6:.1f} MB)")
    print(f"  modo ...... {'DRY-RUN (nada e gravado)' if args.dry_run else 'REPLACE (apaga e recarrega)'}")
    print(f"  tabela .... public.{TABELA}")
    print("")

    stats: Counter = Counter()
    classes: Counter = Counter()
    t0 = time.time()

    if args.dry_run:
        amostra = []
        for rec in iter_registros(str(xlsx), limit, stats):
            classes[f'{rec["codigoClasse"]} {rec["nomeClasse"]}'] += 1
            if len(amostra) < 3:
                amostra.append(rec)
            if stats["emitidas"] % 20000 == 0:
                print(f"  ... {stats['emitidas']:,} itens", flush=True)
        _relatorio(stats, classes, time.time() - t0)
        print("  AMOSTRA")
        for rec in amostra:
            print("")
            for k in COLUMNS:
                if rec[k]:
                    print(f"    {k:<16} {str(rec[k])[:110]}")
        print("")
        print("  Nada foi gravado. Use --confirm para executar a carga.")
        return

    import psycopg

    url = load_database_url()
    print(f"  banco ..... {re.sub(r'://[^@]*@', '://***@', url)}")

    with psycopg.connect(url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.execute(f"SELECT count(*) FROM public.{TABELA}")
            antes = cur.fetchone()[0]
            print(f"  estado atual: {antes:,} itens")
            print("  apagando itens existentes...")
            cur.execute(f"DELETE FROM public.{TABELA}")
            print("  carregando planilha via COPY...")
            cols = ", ".join(f'"{c}"' for c in COLUMNS)
            with cur.copy(f"COPY public.{TABELA} ({cols}) FROM STDIN") as cp:
                for rec in iter_registros(str(xlsx), limit, stats):
                    classes[f'{rec["codigoClasse"]} {rec["nomeClasse"]}'] += 1
                    cp.write_row([rec[c] for c in COLUMNS])
                    if stats["emitidas"] % 20000 == 0:
                        print(f"  ... {stats['emitidas']:,} itens", flush=True)
            cur.execute(f"SELECT count(*) FROM public.{TABELA}")
            depois = cur.fetchone()[0]
        conn.commit()

    _relatorio(stats, classes, time.time() - t0)
    print(f"  itens antes ....... {antes:,}")
    print(f"  itens depois ...... {depois:,}")
    print("  COMMIT concluido.")


def _relatorio(stats: Counter, classes: Counter, dt: float) -> None:
    print("")
    print(f"  linhas lidas ...................... {stats['lidas']:,}")
    print(f"  itens emitidos .................... {stats['emitidas']:,}")
    print(f"  descartadas (sem codigo/descricao)  {stats['descartadas_sem_codigo_ou_descricao']:,}")
    print(f"  duplicadas (mesmo codigo) ......... {stats['duplicadas']:,}")
    print(f"  tempo ............................. {dt:.1f}s")
    print("")
    print(f"  classes ({len(classes)}):")
    for nome, n in sorted(classes.items()):
        print(f"    {nome[:70]:<72} {n:>8,}")
    print("")


if __name__ == "__main__":
    main()
