#!/usr/bin/env python3
"""
Colunas da avaliação da DLOG na cesta da Pesquisa de Preços:

  * public."CestaItem": método do preço e regra do teto (P11/P12), justificativa
    editada, período do art. 5º (D1, em meses ou intervalo de datas),
    atualização pelo IPCA (D2) e as prováveis duplicatas revertidas pelo
    responsável (P18);
  * public."CestaOrcamento": tipo do preço informado (P13 — IV cotação, III
    mídia/sítio, V nota fiscal, II contratação similar), URL e data/hora de
    acesso, chave da NF-e e a justificativa para manter fora do período.

A DDL é a MESMA que `prisma db push` geraria (tirada de `prisma migrate diff`),
com IF NOT EXISTS: um db:push posterior é no-op. Não apaga nada; os itens e
orçamentos existentes ficam com os padrões (tipo IV, IPCA ligado).

Rode ANTES de publicar a versão do painel que lê estas colunas.

Uso:
    python scripts/alter_cesta_dlog.py --dry-run
    python scripts/alter_cesta_dlog.py --confirm
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402

DDL = """
ALTER TABLE public."CestaItem"
    ADD COLUMN IF NOT EXISTS "aliquotaTeto" TEXT,
    ADD COLUMN IF NOT EXISTS "corrigirIpca" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "duplicidadesRevertidas" JSONB,
    ADD COLUMN IF NOT EXISTS "justificativa" TEXT,
    ADD COLUMN IF NOT EXISTS "justificativaPeriodo" TEXT,
    ADD COLUMN IF NOT EXISTS "metodoPreco" TEXT,
    ADD COLUMN IF NOT EXISTS "periodoMeses" INTEGER,
    ADD COLUMN IF NOT EXISTS "periodoInicio" TEXT,
    ADD COLUMN IF NOT EXISTS "regraTeto" TEXT;

ALTER TABLE public."CestaOrcamento"
    ADD COLUMN IF NOT EXISTS "acessadoEm" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "chaveNfe" TEXT,
    ADD COLUMN IF NOT EXISTS "justificativaForaPeriodo" TEXT,
    ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'IV',
    ADD COLUMN IF NOT EXISTS "url" TEXT;
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--dry-run", action="store_true", help="mostra a DDL e sai")
    grupo.add_argument("--confirm", action="store_true", help="executa a DDL no banco")
    args = ap.parse_args()

    if args.dry_run:
        print("DDL que seria executada:")
        print(DDL)
        return 0

    import psycopg

    with psycopg.connect(load_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            for tabela in ("CestaItem", "CestaOrcamento"):
                cur.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position",
                    (tabela,),
                )
                print(f'public."{tabela}": {", ".join(r[0] for r in cur.fetchall())}')
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
