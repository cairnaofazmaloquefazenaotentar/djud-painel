#!/usr/bin/env python3
"""
Importador da planilha CMED "grande padrao" (registro ANVISA x CATMAT x
unidade de fornecimento x quantidade por embalagem) -> tabela "CmedRegistro".

A tabela CMED de precos (PrecoCmed) traz o PMVG por EMBALAGEM. Esta planilha
diz, para cada registro ANVISA, qual e o CATMAT, a unidade de fornecimento e
quantas unidades ha na embalagem (coluna "Qt_Embal"). A Pesquisa de Precos
usa isso para dividir o preco CMED e sempre refletir a menor unidade de
fornecimento (ex.: R$ 0,23 por comprimido, e nao R$ 1,15 pela caixa de 5).

Registros sem CATMAT ("Nao tem", "Fora", vazio) sao importados com
catmat = NULL: so tem preco CMED, sem cruzamento com as bases de mercado.

Planilha esperada ("01. CMED - grande.padrao - ...xlsx"), aba unica, com
cabecalho: Registro, Gen., ICMS, CATMAT, Descricao, Unidade de fornecimento,
Qt_Embal, Substancia, Produto, Apresentacao, CNPJ, Fabricante (ordem livre;
a coluna "xxx" de controle interno e ignorada).

Modo de operacao: REPLACE (espelho exato da planilha). A tabela e criada se
nao existir, com a MESMA DDL que `prisma db push` geraria a partir de
prisma/schema.prisma (model CmedRegistro) — um db:push posterior e no-op.

Uso:
    python scripts/import_cmed_registros.py --file "01. CMED - grande.padrão - de jan.17 a ago.26.xlsx" --dry-run
    python scripts/import_cmed_registros.py --file "01. CMED - grande.padrão - de jan.17 a ago.26.xlsx" --confirm
"""

from __future__ import annotations

import argparse
import glob
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402
from precos_norm import normalizar_unidade  # noqa: E402

TABELA = '"CmedRegistro"'

COLUMNS = [
    "registro", "catmat", "descricaoCatmat", "unidadeFornecimento", "unidadeNorm",
    "qtEmbalagem", "generico", "icms", "substancia", "produto", "apresentacao",
    "cnpj", "fabricante",
]

# cabecalho da planilha (normalizado: sem acento, minusculo, sem espacos) -> campo
HEADERS = {
    "registro": "registro",
    "gen.": "generico",
    "gen": "generico",
    "icms": "icms",
    "catmat": "catmat",
    "descricao": "descricaoCatmat",
    "unidadedefornecimento": "unidadeFornecimento",
    "qt_embal": "qtEmbalagem",
    "qt_embalagem": "qtEmbalagem",
    "substancia": "substancia",
    "produto": "produto",
    "apresentacao": "apresentacao",
    "cnpj": "cnpj",
    "fabricante": "fabricante",
}
OBRIGATORIOS = ["registro", "catmat", "unidadeFornecimento", "qtEmbalagem"]

# DDL identica a de prisma/schema.prisma (model CmedRegistro) — ver comentario la.
DDL = """
CREATE TABLE IF NOT EXISTS public."CmedRegistro" (
    "registro"            TEXT NOT NULL,
    "catmat"              TEXT,
    "descricaoCatmat"     TEXT,
    "unidadeFornecimento" TEXT,
    "unidadeNorm"         TEXT,
    "qtEmbalagem"         INTEGER,
    "generico"            BOOLEAN,
    "icms"                BOOLEAN,
    "substancia"          TEXT,
    "produto"             TEXT,
    "apresentacao"        TEXT,
    "cnpj"                TEXT,
    "fabricante"          TEXT,
    "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CmedRegistro_pkey" PRIMARY KEY ("registro")
);
CREATE INDEX IF NOT EXISTS "CmedRegistro_catmat_idx" ON public."CmedRegistro"("catmat");
CREATE INDEX IF NOT EXISTS "CmedRegistro_unidadeNorm_idx" ON public."CmedRegistro"("unidadeNorm");
"""


def _txt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def _chave_header(v) -> str:
    s = "".join(ch for ch in unicodedata.normalize("NFD", _txt(v)) if not unicodedata.combining(ch))
    return re.sub(r"\s+", "", s.lower())


def _catmat(v) -> str | None:
    d = _txt(v)
    if not re.fullmatch(r"\d{1,7}", d):
        return None  # "Nao tem", "Fora", "N/A", vazio, textos de justificativa
    return d.lstrip("0") or None


def _qt(v) -> int | None:
    s = _txt(v).replace(",", ".")
    try:
        n = int(round(float(s)))
    except ValueError:
        return None
    return n if n > 0 else None


def _bool(v) -> bool | None:
    s = _chave_header(v)
    if s in ("sim", "s", "true", "1"):
        return True
    if s in ("nao", "n", "false", "0"):
        return False
    return None


def iter_registros(path: str, limit: int | None, stats: Counter):
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    header = [_chave_header(h) for h in next(rows)]
    idx: dict[str, int] = {}
    for i, h in enumerate(header):
        campo = HEADERS.get(h)
        if campo and campo not in idx:
            idx[campo] = i
    faltando = [c for c in OBRIGATORIOS if c not in idx]
    if faltando:
        sys.exit(f"ERRO: cabecalho sem as colunas {faltando}. Encontrado: {header}")

    def get(row, campo: str):
        i = idx.get(campo)
        return row[i] if i is not None and i < len(row) else None

    vistos: set[str] = set()
    for row in rows:
        stats["lidas"] += 1
        registro = re.sub(r"\D", "", _txt(get(row, "registro")))
        if not registro:
            stats["descartadas_sem_registro"] += 1
            continue
        if registro in vistos:
            stats["duplicadas"] += 1
            continue
        vistos.add(registro)

        catmat = _catmat(get(row, "catmat"))
        unidade = _txt(get(row, "unidadeFornecimento")) or None
        qt = _qt(get(row, "qtEmbalagem"))
        stats["emitidas"] += 1
        stats["com_catmat" if catmat else "sem_catmat"] += 1
        if catmat and not qt:
            stats["com_catmat_sem_qt"] += 1
        if catmat and not unidade:
            stats["com_catmat_sem_unidade"] += 1

        yield {
            "registro": registro,
            "catmat": catmat,
            "descricaoCatmat": _txt(get(row, "descricaoCatmat")) or None,
            "unidadeFornecimento": unidade,
            "unidadeNorm": normalizar_unidade(unidade) or None,
            "qtEmbalagem": qt,
            "generico": _bool(get(row, "generico")),
            "icms": _bool(get(row, "icms")),
            "substancia": _txt(get(row, "substancia")) or None,
            "produto": _txt(get(row, "produto")) or None,
            "apresentacao": _txt(get(row, "apresentacao")) or None,
            "cnpj": _txt(get(row, "cnpj")) or None,
            "fabricante": _txt(get(row, "fabricante")) or None,
        }
        if limit and stats["emitidas"] >= limit:
            break
    wb.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", help="planilha xlsx (padrao: '*CMED*grande*.xlsx' mais recente)")
    ap.add_argument("--dry-run", action="store_true", help="valida sem tocar no banco")
    ap.add_argument("--confirm", action="store_true", help="executa a carga (REPLACE)")
    ap.add_argument("--limit", type=int, default=0, help="processa apenas N registros")
    args = ap.parse_args()

    if not args.dry_run and not args.confirm:
        ap.error("informe --dry-run ou --confirm")

    arquivo = args.file
    if not arquivo:
        candidatos = sorted(glob.glob("*CMED*grande*.xlsx"))
        if not candidatos:
            sys.exit("ERRO: informe --file (nenhuma '*CMED*grande*.xlsx' na pasta atual)")
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
    unidades: Counter = Counter()
    t0 = time.time()

    if args.dry_run:
        amostra = []
        for rec in iter_registros(str(xlsx), limit, stats):
            unidades[rec["unidadeNorm"] or "(sem unidade)"] += 1
            if len(amostra) < 3:
                amostra.append(rec)
            if stats["emitidas"] % 10000 == 0:
                print(f"  ... {stats['emitidas']:,} registros", flush=True)
        _relatorio(stats, unidades, time.time() - t0)
        print("  AMOSTRA")
        for rec in amostra:
            print("")
            for k in COLUMNS:
                if rec[k] is not None:
                    print(f"    {k:<20} {str(rec[k])[:100]}")
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
            print(f"  estado atual: {antes:,} registros")
            print("  apagando registros existentes...")
            cur.execute(f"DELETE FROM public.{TABELA}")
            print("  carregando planilha via COPY...")
            cols = ", ".join(f'"{c}"' for c in COLUMNS)
            with cur.copy(f"COPY public.{TABELA} ({cols}) FROM STDIN") as cp:
                for rec in iter_registros(str(xlsx), limit, stats):
                    unidades[rec["unidadeNorm"] or "(sem unidade)"] += 1
                    cp.write_row([rec[c] for c in COLUMNS])
                    if stats["emitidas"] % 10000 == 0:
                        print(f"  ... {stats['emitidas']:,} registros", flush=True)
            cur.execute(f"SELECT count(*) FROM public.{TABELA}")
            depois = cur.fetchone()[0]
            # Cobertura: quantos registros com preco na CMED (PrecoCmed) ganharam CATMAT/Qt_Embal.
            cur.execute(
                'SELECT count(DISTINCT p.registro), count(DISTINCT r.registro) '
                'FROM public."PrecoCmed" p LEFT JOIN public."CmedRegistro" r ON r.registro = p.registro'
            )
            total_preco, com_meta = cur.fetchone()
        conn.commit()

    _relatorio(stats, unidades, time.time() - t0)
    print(f"  registros antes ... {antes:,}")
    print(f"  registros depois .. {depois:,}")
    print(f"  cobertura PrecoCmed {com_meta:,} de {total_preco:,} registros com preco tem CATMAT/Qt_Embal")
    print("  COMMIT concluido.")


def _relatorio(stats: Counter, unidades: Counter, dt: float) -> None:
    print("")
    print(f"  linhas lidas .................. {stats['lidas']:,}")
    print(f"  registros emitidos ............ {stats['emitidas']:,}")
    print(f"    com CATMAT .................. {stats['com_catmat']:,}")
    print(f"    sem CATMAT (so preco CMED) .. {stats['sem_catmat']:,}")
    print(f"    com CATMAT e sem Qt_Embal ... {stats['com_catmat_sem_qt']:,}")
    print(f"    com CATMAT e sem unidade .... {stats['com_catmat_sem_unidade']:,}")
    print(f"  descartadas (sem registro) .... {stats['descartadas_sem_registro']:,}")
    print(f"  duplicadas (mesmo registro) ... {stats['duplicadas']:,}")
    print(f"  tempo ......................... {dt:.1f}s")
    print("")
    print("  unidades de fornecimento mais frequentes (normalizadas):")
    for nome, n in unidades.most_common(12):
        print(f"    {nome:<40} {n:>8,}")
    print("")


if __name__ == "__main__":
    main()
