#!/usr/bin/env python3
"""
Dump SQL completo do banco Neon -> arquivo restauravel com psql.

Existe porque esta maquina nao tem pg_dump nem psql, e o Docker Desktop nao
esta rodando. A DDL nao e reconstruida na mao: vem das funcoes de catalogo do
proprio Postgres (format_type, pg_get_constraintdef, pg_get_indexdef), que sao
as mesmas que o pg_dump usa. Os dados saem por COPY ... TO STDOUT em texto,
formato que o psql le de volta direto.

Ordem do arquivo (a mesma do pg_dump plain): schemas -> tipos -> tabelas ->
dados -> PK/unique/check -> indices -> foreign keys -> sequences. Constraints
e indices depois dos dados para o restore nao validar linha a linha, e as FKs
por ultimo para a ordem das tabelas nao importar.

Uso:
    python scripts/dump_neon.py                      # dump completo -> backups/
    python scripts/dump_neon.py --schema-only
    python scripts/dump_neon.py --gzip
    python scripts/dump_neon.py --out caminho.sql

Restaurar:
    createdb djud
    psql -d djud -f backups/neondump-<data>.sql
"""

from __future__ import annotations

import argparse
import gzip
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_redmine_base import load_database_url  # noqa: E402

SCHEMAS = ("public", "sismat")

CABECALHO = """--
-- Dump do banco DJUD (Neon) — gerado por scripts/dump_neon.py
-- Origem: PostgreSQL {versao}
-- Data:   {data}
--
-- Restaurar:
--     createdb djud
--     psql -d djud -f {arquivo}
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

"""


def q(ident: str) -> str:
    """Aspas duplas com escape, para identificadores."""
    return '"' + ident.replace('"', '""') + '"'


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", help="arquivo de saida (default: backups/neondump-<data>.sql)")
    ap.add_argument("--schema-only", action="store_true", help="omite os dados")
    ap.add_argument("--data-only", action="store_true", help="omite a DDL")
    ap.add_argument("--gzip", action="store_true", help="comprime a saida (.sql.gz)")
    args = ap.parse_args()

    import psycopg

    destino = Path(args.out) if args.out else Path("backups") / (
        f"neondump-{datetime.now():%Y%m%d-%H%M%S}.sql" + (".gz" if args.gzip else "")
    )
    destino.parent.mkdir(parents=True, exist_ok=True)
    abrir = (lambda: gzip.open(destino, "wt", encoding="utf-8", newline="\n")) if args.gzip \
        else (lambda: destino.open("w", encoding="utf-8", newline="\n"))

    t0 = time.time()
    url = load_database_url()
    print(f"  destino ... {destino}")

    with psycopg.connect(url, autocommit=True) as conn, conn.cursor() as cur, abrir() as out:
        cur.execute("select version()")
        versao = cur.fetchone()[0].split(" on ")[0]
        out.write(CABECALHO.format(versao=versao, data=datetime.now().isoformat(timespec="seconds"),
                                   arquivo=destino.name))

        # ── tabelas do dump, em ordem estavel ───────────────────────────────
        cur.execute(
            """select c.oid, n.nspname, c.relname
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where c.relkind = 'r' and n.nspname = any(%s)
               order by n.nspname, c.relname""",
            (list(SCHEMAS),),
        )
        tabelas = cur.fetchall()
        print(f"  tabelas ... {len(tabelas)}")

        if not args.data_only:
            # ── schemas ────────────────────────────────────────────────────
            out.write("--\n-- Schemas\n--\n\n")
            for s in SCHEMAS:
                if s != "public":
                    out.write(f"CREATE SCHEMA IF NOT EXISTS {q(s)};\n")
            # format_type e pg_get_constraintdef omitem o schema quando o objeto
            # esta no search_path — o tipo do enum sai como "FormaCumprimento" e a
            # FK como REFERENCES "User"(id). Fixar o search_path aqui faz essas
            # referencias resolverem no restore, independente do usuario.
            out.write(f"\nSET search_path = {', '.join(q(s) for s in SCHEMAS)};\n\n")

            # ── enums ──────────────────────────────────────────────────────
            cur.execute(
                """select n.nspname, t.typname,
                          array_agg(e.enumlabel order by e.enumsortorder)
                   from pg_type t
                   join pg_namespace n on n.oid = t.typnamespace
                   join pg_enum e on e.enumtypid = t.oid
                   where t.typtype = 'e' and n.nspname = any(%s)
                   group by 1, 2 order by 1, 2""",
                (list(SCHEMAS),),
            )
            enums = cur.fetchall()
            if enums:
                out.write("--\n-- Tipos enumerados\n--\n\n")
                for ns, nome, labels in enums:
                    vals = ",\n    ".join("'" + l.replace("'", "''") + "'" for l in labels)
                    out.write(f"CREATE TYPE {q(ns)}.{q(nome)} AS ENUM (\n    {vals}\n);\n\n")
                print(f"  enums ..... {len(enums)}")

            # ── tabelas ────────────────────────────────────────────────────
            out.write("--\n-- Tabelas\n--\n\n")
            for oid, ns, tbl in tabelas:
                cur.execute(
                    """select a.attname,
                              format_type(a.atttypid, a.atttypmod),
                              a.attnotnull,
                              pg_get_expr(d.adbin, d.adrelid),
                              a.attidentity
                       from pg_attribute a
                       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                       where a.attrelid = %s and a.attnum > 0 and not a.attisdropped
                       order by a.attnum""",
                    (oid,),
                )
                linhas = []
                for nome, tipo, notnull, default, identity in cur.fetchall():
                    peca = f"    {q(nome)} {tipo}"
                    if identity:
                        sempre = "ALWAYS" if identity == "a" else "BY DEFAULT"
                        peca += f" GENERATED {sempre} AS IDENTITY"
                    elif default is not None:
                        peca += f" DEFAULT {default}"
                    if notnull:
                        peca += " NOT NULL"
                    linhas.append(peca)
                out.write(f"CREATE TABLE {q(ns)}.{q(tbl)} (\n" + ",\n".join(linhas) + "\n);\n\n")

        # ── dados ──────────────────────────────────────────────────────────
        if not args.schema_only:
            out.write("--\n-- Dados\n--\n\n")
            for oid, ns, tbl in tabelas:
                cur.execute(
                    """select a.attname from pg_attribute a
                       where a.attrelid = %s and a.attnum > 0 and not a.attisdropped
                         and a.attgenerated = '' order by a.attnum""",
                    (oid,),
                )
                cols = [r[0] for r in cur.fetchall()]
                lista = ", ".join(q(c) for c in cols)
                alvo = f"{q(ns)}.{q(tbl)}"

                out.write(f"COPY {alvo} ({lista}) FROM stdin;\n")
                n = 0
                with cur.copy(f"COPY {alvo} ({lista}) TO STDOUT") as cp:
                    resto = b""
                    for chunk in cp:
                        resto += bytes(chunk)
                        n += resto.count(b"\n")
                        out.write(resto.decode("utf-8"))
                        resto = b""
                out.write("\\.\n\n")
                print(f"    {ns}.{tbl:<24} {n:>9,} linhas", flush=True)

        if not args.data_only:
            # ── constraints: PK, unique, check (FK fica para o fim) ────────
            out.write("--\n-- Chaves primarias, unique e check\n--\n\n")
            nao_fk = 0
            for oid, ns, tbl in tabelas:
                cur.execute(
                    """select conname, pg_get_constraintdef(oid) from pg_constraint
                       where conrelid = %s and contype in ('p','u','c') order by contype, conname""",
                    (oid,),
                )
                for nome, definicao in cur.fetchall():
                    out.write(f"ALTER TABLE ONLY {q(ns)}.{q(tbl)}\n"
                              f"    ADD CONSTRAINT {q(nome)} {definicao};\n")
                    nao_fk += 1
            out.write("\n")

            # ── indices que nao sao de constraint ──────────────────────────
            out.write("--\n-- Indices\n--\n\n")
            cur.execute(
                """select i.indexdef from pg_indexes i
                   where i.schemaname = any(%s)
                     and not exists (
                       select 1 from pg_constraint c
                       join pg_class ic on ic.oid = c.conindid
                       join pg_namespace n on n.oid = ic.relnamespace
                       where n.nspname = i.schemaname and ic.relname = i.indexname)
                   order by i.schemaname, i.tablename, i.indexname""",
                (list(SCHEMAS),),
            )
            indices = cur.fetchall()
            for (definicao,) in indices:
                out.write(definicao + ";\n")
            out.write("\n")

            # ── sequences ──────────────────────────────────────────────────
            cur.execute(
                "select schemaname, sequencename, last_value from pg_sequences where schemaname = any(%s)",
                (list(SCHEMAS),),
            )
            seqs = cur.fetchall()
            if seqs:
                out.write("--\n-- Sequences\n--\n\n")
                for ns, nome, last in seqs:
                    if last is not None:
                        # O nome vai entre aspas dentro da string: sem isso o Postgres
                        # dobra "SismatPmvg_id_seq" para minusculas e nao acha a sequence.
                        alvo_seq = f"{ns}.{q(nome)}".replace("'", "''")
                        out.write(f"SELECT pg_catalog.setval('{alvo_seq}', {last}, true);\n")
                out.write("\n")

            # ── foreign keys por ultimo ────────────────────────────────────
            out.write("--\n-- Foreign keys\n--\n\n")
            fks = 0
            for oid, ns, tbl in tabelas:
                cur.execute(
                    """select conname, pg_get_constraintdef(oid) from pg_constraint
                       where conrelid = %s and contype = 'f' order by conname""",
                    (oid,),
                )
                for nome, definicao in cur.fetchall():
                    out.write(f"ALTER TABLE ONLY {q(ns)}.{q(tbl)}\n"
                              f"    ADD CONSTRAINT {q(nome)} {definicao};\n")
                    fks += 1
            out.write("\n--\n-- Fim do dump\n--\n")
            print(f"  constraints {nao_fk} (+{fks} FKs), indices {len(indices)}, sequences {len(seqs)}")

    tam = destino.stat().st_size
    print(f"\n  OK: {destino}  ({tam / 1e6:.1f} MB em {time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
