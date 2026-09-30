#!/usr/bin/env python3
"""
Cria public."CestaOrcamento" e a coluna public."CestaItem"."exclusoes".

Sao as duas mudancas de schema da curadoria da Pesquisa de Precos:

  * CestaOrcamento — orcamento apresentado diretamente por fornecedor
    (IN SEGES/ME n. 65/2021, art. 5., IV), preso ao item da cesta.
  * CestaItem.exclusoes (JSONB) — registros desconsiderados com justificativa
    (art. 6., paras. 1. e 2.), reaplicados quando o relatorio da cesta refaz a
    pesquisa de cada item.

A DDL e a MESMA que `prisma db push` geraria a partir de prisma/schema.prisma —
um db:push posterior e no-op. Existe em Python porque a maquina de trabalho nao
tem node/node_modules (ver CLAUDE.md e os demais scripts em scripts/).

Nao apaga nada: CREATE TABLE / CREATE INDEX / ADD COLUMN todos com IF NOT
EXISTS, e a foreign key so e criada se ainda nao existir.

Uso:
    python scripts/create_orcamento_table.py --dry-run
    python scripts/create_orcamento_table.py --confirm
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402

DDL = """
ALTER TABLE public."CestaItem"
    ADD COLUMN IF NOT EXISTS "exclusoes" JSONB;

CREATE TABLE IF NOT EXISTS public."CestaOrcamento" (
    "id"                  TEXT NOT NULL,
    "cestaItemId"         TEXT NOT NULL,
    "fornecedor"          TEXT NOT NULL,
    "cnpj"                TEXT,
    "marca"               TEXT,
    "fabricante"          TEXT,
    "valorUnitario"       DOUBLE PRECISION NOT NULL,
    "dataOrcamento"       TIMESTAMP(3) NOT NULL,
    "validade"            TIMESTAMP(3),
    "documento"           TEXT,
    "observacao"          TEXT,
    "considerarNoCalculo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CestaOrcamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CestaOrcamento_cestaItemId_idx"
    ON public."CestaOrcamento"("cestaItemId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CestaOrcamento_cestaItemId_fkey'
    ) THEN
        ALTER TABLE public."CestaOrcamento"
            ADD CONSTRAINT "CestaOrcamento_cestaItemId_fkey"
            FOREIGN KEY ("cestaItemId") REFERENCES public."CestaItem"("id")
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
                 WHERE table_schema = 'public' AND table_name = 'CestaOrcamento'
                 ORDER BY ordinal_position
                """
            )
            colunas = cur.fetchall()
            cur.execute('SELECT COUNT(*) FROM public."CestaOrcamento"')
            total = cur.fetchone()[0]
            cur.execute(
                """
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'CestaItem'
                   AND column_name = 'exclusoes'
                """
            )
            tem_exclusoes = cur.fetchone()[0] == 1
        conn.commit()

    print(f'Tabela public."CestaOrcamento" pronta — {len(colunas)} coluna(s), {total} linha(s).')
    for nome, tipo in colunas:
        print(f"  {nome:<20} {tipo}")
    print(f'Coluna public."CestaItem"."exclusoes": {"ok" if tem_exclusoes else "AUSENTE"}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
