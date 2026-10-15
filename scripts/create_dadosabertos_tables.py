#!/usr/bin/env python3
"""
Cria as tabelas dos preços coletados das APIs de dados abertos (Frente D0 da
avaliação da DLOG):

  * public."DadosAbertosPreco"  — registros do Compras.gov.br (Painel de Preços),
    do BPS (API do Ministério da Saúde) e dos itens de ata, com id determinístico;
  * public."DadosAbertosColeta" — uma linha por coleta (origem x CATMAT x janela),
    com esperados x baixados;
  * public."PncpVinculo"        — compra (idCompra) -> contratação no PNCP.

A DDL é a MESMA que `prisma db push` geraria a partir de prisma/schema.prisma
(tirada de `prisma migrate diff --from-schema-datamodel <main>
--to-schema-datamodel prisma/schema.prisma --script`), só que com IF NOT EXISTS:
um db:push posterior é no-op. Não apaga nada.

Uso:
    python scripts/create_dadosabertos_tables.py --dry-run
    python scripts/create_dadosabertos_tables.py --confirm
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402

DDL = """
CREATE TABLE IF NOT EXISTS public."DadosAbertosPreco" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "chaveOrigem" TEXT NOT NULL,
    "chaveItemCompra22" TEXT,
    "codigoCatmat" TEXT NOT NULL,
    "codigoPdm" TEXT,
    "descricao" TEXT NOT NULL,
    "descricaoDetalhada" TEXT,
    "unidade" TEXT,
    "unidadeNorm" TEXT,
    "capacidade" DOUBLE PRECISION,
    "quantidade" DOUBLE PRECISION,
    "precoUnitario" DOUBLE PRECISION NOT NULL,
    "valorUnitarioEstimado" DOUBLE PRECISION,
    "dataCompra" DATE,
    "dataResultado" DATE,
    "dataInsercao" DATE,
    "idCompra" TEXT,
    "numeroCompra" TEXT,
    "numeroItemCompra" TEXT,
    "modalidade" TEXT,
    "criterioJulgamento" TEXT,
    "forma" TEXT,
    "situacao" TEXT,
    "codigoUasg" TEXT,
    "nomeUasg" TEXT,
    "orgao" TEXT,
    "cnpjOrgao" TEXT,
    "esfera" TEXT,
    "poder" TEXT,
    "uf" TEXT,
    "municipio" TEXT,
    "niFornecedor" TEXT,
    "nomeFornecedor" TEXT,
    "marca" TEXT,
    "cnpjFabricante" TEXT,
    "nomeFabricante" TEXT,
    "registroAnvisa" TEXT,
    "generico" BOOLEAN,
    "processoCompra" TEXT,
    "numeroAta" TEXT,
    "validadeCompra" TEXT,
    "observacoes" TEXT,
    "numeroControlePncp" TEXT,
    "numeroControlePncpAta" TEXT,
    "origemCarga" TEXT NOT NULL,
    "bruto" JSONB,
    "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DadosAbertosPreco_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."DadosAbertosColeta" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "codigoCatmat" TEXT NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "assinatura" TEXT,
    "status" TEXT NOT NULL,
    "paginas" INTEGER NOT NULL DEFAULT 0,
    "esperados" INTEGER,
    "baixados" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "origemCarga" TEXT NOT NULL DEFAULT 'API_PAINEL',
    "usuarioId" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    CONSTRAINT "DadosAbertosColeta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."PncpVinculo" (
    "idCompra" TEXT NOT NULL,
    "encontrado" BOOLEAN NOT NULL,
    "numeroControlePncp" TEXT,
    "situacao" TEXT,
    "modalidade" TEXT,
    "numeroCompra" TEXT,
    "processo" TEXT,
    "objeto" TEXT,
    "cnpjOrgao" TEXT,
    "url" TEXT,
    "itens" JSONB,
    "bruto" JSONB,
    "consultadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PncpVinculo_pkey" PRIMARY KEY ("idCompra")
);

CREATE INDEX IF NOT EXISTS "DadosAbertosPreco_codigoCatmat_origem_dataCompra_idx"
    ON public."DadosAbertosPreco"("codigoCatmat", "origem", "dataCompra");
CREATE INDEX IF NOT EXISTS "DadosAbertosPreco_idCompra_idx"
    ON public."DadosAbertosPreco"("idCompra");
CREATE UNIQUE INDEX IF NOT EXISTS "DadosAbertosPreco_origem_chaveOrigem_key"
    ON public."DadosAbertosPreco"("origem", "chaveOrigem");
CREATE INDEX IF NOT EXISTS "DadosAbertosColeta_codigoCatmat_origem_iniciadoEm_idx"
    ON public."DadosAbertosColeta"("codigoCatmat", "origem", "iniciadoEm");
"""

TABELAS = ("DadosAbertosPreco", "DadosAbertosColeta", "PncpVinculo")


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
            for tabela in TABELAS:
                cur.execute(
                    "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s",
                    (tabela,),
                )
                colunas = cur.fetchone()[0]
                cur.execute(f'SELECT count(*) FROM public."{tabela}"')
                linhas = cur.fetchone()[0]
                print(f'public."{tabela}": {colunas} coluna(s), {linhas} linha(s).')
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
