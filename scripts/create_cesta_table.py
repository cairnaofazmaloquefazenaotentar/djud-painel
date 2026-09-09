#!/usr/bin/env python3
"""
Cria a tabela public."CestaItem" (cesta de itens da Pesquisa de Precos).

A DDL abaixo e a MESMA que `prisma db push` geraria a partir do model CestaItem
em prisma/schema.prisma — um db:push posterior e no-op. Existe em Python porque
a maquina de trabalho nao tem node/node_modules (ver CLAUDE.md e os demais
importadores em scripts/).

Nao apaga nada: usa CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS e
so cria a foreign key se ela ainda nao existir.

Uso:
    python scripts/create_cesta_table.py --dry-run
    python scripts/create_cesta_table.py --confirm
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402

TABELA = 'public."CestaItem"'

DDL = """
CREATE TABLE IF NOT EXISTS public."CestaItem" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "codigo"          TEXT NOT NULL,
    "tipo"            TEXT NOT NULL,
    "catmat"          TEXT,
    "descricao"       TEXT NOT NULL,
    "unidade"         TEXT NOT NULL,
    "uf"              TEXT,
    "quantidade"      INTEGER NOT NULL DEFAULT 1,
    "observacao"      TEXT,
    "precoReferencia" DOUBLE PRECISION,
    "limitePmvg"      DOUBLE PRECISION,
    "precoFinal"      DOUBLE PRECISION,
    "calculadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CestaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CestaItem_userId_idx"
    ON public."CestaItem"("userId");

CREATE INDEX IF NOT EXISTS "CestaItem_userId_codigo_unidade_idx"
    ON public."CestaItem"("userId", "codigo", "unidade");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CestaItem_userId_fkey'
    ) THEN
        ALTER TABLE public."CestaItem"
            ADD CONSTRAINT "CestaItem_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES public."User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--dry-run", action="store_true", help="mostra a DDL e sai")
    grupo.add_argument("--confirm", action="store_true", help="executa a DDL no banco")
    args = ap.parse_args()

    if args.dry_run:
        print("DDL que seria executada:")
        print(DDL)
        return 0

    import psycopg

    url = load_database_url()
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.execute(
                """
                SELECT column_name, data_type
                  FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'CestaItem'
                 ORDER BY ordinal_position
                """
            )
            colunas = cur.fetchall()
            cur.execute('SELECT COUNT(*) FROM public."CestaItem"')
            total = cur.fetchone()[0]
        conn.commit()

    print(f'Tabela {TABELA} pronta — {len(colunas)} coluna(s), {total} linha(s).')
    for nome, tipo in colunas:
        print(f"  {nome:<16} {tipo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
