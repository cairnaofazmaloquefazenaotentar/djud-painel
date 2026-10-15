#!/usr/bin/env python3
"""
Colunas da avaliacao da DLOG em public."Demanda" (A4, A5 e A6):

  * "buscaNorm"  — texto normalizado da busca (lib/demandas-filtro-tipos.ts,
    montarBuscaNorm; espelho em scripts/demandas_busca.py), com indice GIN
    pg_trgm: a busca por trecho deixa de varrer as ~59 mil linhas (P8);
  * "nupSei"     — NUP_SEI Principal do Redmine, formato canonico (A6);
  * "medicamento", "medicamentoOrigem", "apresentacoes", "catmatsDerivados"
    — preenchidas pelo enriquecimento (A5, scripts/enriquecer_demandas.py).

A DDL e a MESMA que `prisma db push` geraria (tirada de `prisma migrate diff`),
com IF NOT EXISTS: um db:push depois e no-op. A extensao pg_trgm precisa
existir antes do indice (`CREATE EXTENSION IF NOT EXISTS pg_trgm` — no Neon
ela esta disponivel e nao instalada; confirmar antes do --confirm).

Depois da DDL, o script preenche "buscaNorm" de todas as demandas (UPDATE em
lote; nao mexe em "atualizadoEm"). Com --redmine, preenche tambem o "nupSei"
pela coluna "NUP_SEI Principal" da planilha, casando pelo id do Redmine
("numero") — sem o REPLACE do importador. Nao apaga nada.

Rode ANTES de publicar a versao do painel que le estas colunas.

Uso:
    python scripts/alter_demanda_busca.py --dry-run
    python scripts/alter_demanda_busca.py --confirm
    python scripts/alter_demanda_busca.py --confirm --redmine baseRedmine_20260827.xlsx
    python scripts/alter_demanda_busca.py --confirm --somente-busca   # so recalcula buscaNorm
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from demandas_busca import montar_busca_norm, normalizar_nup_sei  # noqa: E402
from import_redmine_base import load_database_url  # noqa: E402

EXTENSAO = "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

DDL = """
ALTER TABLE public."Demanda"
    ADD COLUMN IF NOT EXISTS "apresentacoes" JSONB,
    ADD COLUMN IF NOT EXISTS "buscaNorm" TEXT,
    ADD COLUMN IF NOT EXISTS "catmatsDerivados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "medicamento" TEXT,
    ADD COLUMN IF NOT EXISTS "medicamentoOrigem" TEXT,
    ADD COLUMN IF NOT EXISTS "nupSei" TEXT;

CREATE INDEX IF NOT EXISTS "Demanda_nupSei_idx" ON public."Demanda"("nupSei");
CREATE INDEX IF NOT EXISTS "Demanda_buscaNorm_trgm_idx" ON public."Demanda" USING GIN ("buscaNorm" gin_trgm_ops);
"""

CAMPOS = ["id", "numero", "numeroProcesso", "nupSei", "titulo", "principioAtivo", "medicamento", "descricao"]


def nups_da_planilha(caminho: Path) -> dict[str, str]:
    """id do Redmine -> NUP canonico, lendo a planilha em streaming (como o importador)."""
    from import_redmine_base import iter_rows, txt  # noqa: E402

    it = iter_rows(str(caminho))
    cab = next(it)
    idx = {(h or "").strip(): i for i, h in enumerate(cab) if h}
    i_id, i_nup = idx.get("id"), idx.get("NUP_SEI Principal")
    if i_id is None or i_nup is None:
        sys.exit('ERRO: a planilha precisa das colunas "id" e "NUP_SEI Principal".')
    saida: dict[str, str] = {}
    for row in it:
        rid = txt(row[i_id]) if i_id < len(row) else None
        nup = normalizar_nup_sei(row[i_nup]) if i_nup < len(row) else None
        if rid and nup:
            saida.setdefault(rid, nup)
    return saida


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--dry-run", action="store_true", help="mostra a DDL e o que seria preenchido")
    grupo.add_argument("--confirm", action="store_true", help="executa a DDL e preenche as colunas")
    ap.add_argument("--redmine", type=Path, help="planilha do Redmine para preencher o nupSei (sem REPLACE)")
    ap.add_argument("--somente-busca", action="store_true", help="pula a DDL e so recalcula buscaNorm")
    args = ap.parse_args()

    import psycopg

    nups = nups_da_planilha(args.redmine) if args.redmine else {}
    if args.redmine:
        print(f"planilha: {len(nups):,} demandas com NUP_SEI Principal reconhecido")

    with psycopg.connect(load_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT installed_version, default_version FROM pg_available_extensions WHERE name = 'pg_trgm'")
            ext = cur.fetchone()
            if not ext:
                sys.exit("ERRO: a extensao pg_trgm nao esta disponivel neste banco.")
            print(f"pg_trgm: {'instalada (' + ext[0] + ')' if ext[0] else 'disponivel, nao instalada (' + ext[1] + ')'}")
            cur.execute('SELECT count(*) FROM public."Demanda"')
            total = cur.fetchone()[0]
            print(f"demandas: {total:,}")

            if args.dry_run:
                print("\nDDL que seria executada:")
                print(EXTENSAO)
                print(DDL)
                print(f'Depois: "buscaNorm" recalculado nas {total:,} demandas'
                      + (f'; "nupSei" para as que casarem com a planilha ({len(nups):,} na planilha).' if nups else "."))
                return 0

            if not args.somente_busca:
                cur.execute(EXTENSAO)
                cur.execute(DDL)
                print("DDL aplicada.")

            # Carga em lote: tabela temporaria + um UPDATE so.
            t0 = time.time()
            cur.execute(
                'CREATE TEMP TABLE _busca (id TEXT PRIMARY KEY, "buscaNorm" TEXT, "nupSei" TEXT) ON COMMIT DROP'
            )
            colunas = ", ".join(f'"{c}"' for c in CAMPOS)
            linhas = []
            with conn.cursor(name="leitura") as leitura:
                leitura.itersize = 5000
                leitura.execute(f'SELECT {colunas} FROM public."Demanda"')
                for row in leitura:
                    d = dict(zip(CAMPOS, row))
                    nup = nups.get(str(d["numero"])) or d["nupSei"]
                    d["nupSei"] = nup
                    linhas.append((d["id"], montar_busca_norm(d), nup))
            with cur.copy('COPY _busca (id, "buscaNorm", "nupSei") FROM STDIN') as cp:
                for linha in linhas:
                    cp.write_row(linha)
            cur.execute(
                'UPDATE public."Demanda" d SET "buscaNorm" = b."buscaNorm", "nupSei" = b."nupSei" '
                'FROM _busca b WHERE d.id = b.id AND (d."buscaNorm" IS DISTINCT FROM b."buscaNorm" '
                'OR d."nupSei" IS DISTINCT FROM b."nupSei")'
            )
            atualizadas = cur.rowcount
            cur.execute('SELECT count(*) FILTER (WHERE "nupSei" IS NOT NULL), count(*) FILTER (WHERE "buscaNorm" IS NOT NULL) FROM public."Demanda"')
            com_nup, com_busca = cur.fetchone()
        conn.commit()
    print(f"{atualizadas:,} demanda(s) atualizada(s) em {time.time() - t0:.1f}s; "
          f"buscaNorm em {com_busca:,} e nupSei em {com_nup:,} de {total:,}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
