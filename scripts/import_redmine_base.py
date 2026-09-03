#!/usr/bin/env python3
"""
Importador da base do Redmine (xlsx) -> tabela "Demanda" no Postgres/Neon.

Por que Python e nao o script TS: a exportacao do Redmine vem como uma unica
planilha com strings inline (sem sharedStrings), o que da ~315 MB de XML
descomprimido. O SheetJS carrega tudo na memoria; aqui a planilha e lida em
streaming com a stdlib (zipfile + iterparse), e a carga vai por COPY.

Modo de operacao: REPLACE (espelho exato da planilha).
    Todas as demandas existentes sao apagadas e a planilha e recarregada.
    ATENCAO: o DELETE cascateia para "Attachment" (anexos das demandas).
    Um backup CSV de "Demanda" e "Attachment" e gravado antes do DELETE.

Uso:
    python scripts/import_redmine_base.py --dry-run
    python scripts/import_redmine_base.py --dry-run --limit 500
    python scripts/import_redmine_base.py --confirm
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import sys
import time
import zipfile
from collections import Counter
from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from xml.etree.ElementTree import iterparse

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SHEET_PATH = "xl/worksheets/sheet1.xml"
DEFAULT_XLSX = "baseRedmine_20260827.xlsx"
SISTEMA_EMAIL = "sistema@djud.gov.br"

# TRF so tem 6 regioes; o resto ("0a", "13a", "610a"...) e erro de digitacao na origem.
TRF_MAX = 6

FORMA_CUMPRIMENTO = {
    "deposito judicial": "DEPOSITO_JUDICIAL",
    "aquisicao djud": "AQUISICAO_DJUD",
    "entrega ceaf": "ENTREGA_CEAF",
}

REGIAO_BRASIL = {
    "norte": "Norte",
    "nordeste": "Nordeste",
    "centro-oeste": "Centro-Oeste",
    "sudeste": "Sudeste",
    "sul": "Sul",
}

UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}

# Colunas de "Demanda" preenchidas pelo COPY. As omitidas ficam NULL/default.
COLUMNS = [
    "id", "numero", "titulo", "descricao", "projeto", "ano", "origemDemanda",
    "status", "prioridade", "pontoControle", "trfRegiao", "ufResidencia",
    "ufOcorrencia", "municipio", "tipoRepresentacaoJudicial",
    "areaTematicaConsultor", "areaFinalisticaMs", "numeroExterno",
    "areaTematica", "regiaoBrasil", "objetoAcao", "principioAtivo",
    "numeroProcesso", "dataEntradaDJUD", "formaCumprimento", "valorEstimado",
    "dataInicio", "criadoPorId", "tags", "criadoEm", "atualizadoEm",
]


# ---------------------------------------------------------------- leitura xlsx

def _col_index(ref: str) -> int:
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def iter_rows(path: str, limit: int | None = None):
    """Gera cada linha da planilha como lista de strings (None onde vazio)."""
    with zipfile.ZipFile(path) as zf, zf.open(SHEET_PATH) as fh:
        count = 0
        cur: dict[int, str] | None = None
        for ev, el in iterparse(fh, events=("start", "end")):
            if ev == "start":
                if el.tag == NS + "row":
                    cur = {}
                continue
            if el.tag == NS + "c":
                if cur is not None:
                    node = el.find(NS + "is/" + NS + "t")
                    if node is None:
                        node = el.find(NS + "v")
                    if node is not None and node.text is not None:
                        cur[_col_index(el.get("r", ""))] = node.text
                el.clear()
            elif el.tag == NS + "row":
                if cur:
                    yield [cur.get(i) for i in range(max(cur) + 1)]
                else:
                    yield []
                cur = None
                el.clear()
                count += 1
                if limit and count >= limit:
                    return


# ------------------------------------------------------------------ conversoes

def txt(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _lixo(s: str) -> bool:
    return not s or s.startswith("==>") or s.upper() in {"N/A", "NA"}


def _desempacotar(s: str, profundidade: int = 4) -> list[str]:
    """Achata um valor em seus itens, lidando com o JSON aninhado da origem.

    A base traz tres formas para o mesmo campo:
      `Canabidiol`                 -> texto puro
      `["Canabidiol"]`             -> array JSON de 1 item
      `["[\\"Medicamento\\"]"]`    -> array JSON *duplamente* codificado
    e qualquer uma delas pode aparecer como segmento de uma string separada
    por " | " (ex.: `["Ipilimumabe"] | Nivolumabe`). Por isso o desempacote
    e recursivo e roda por segmento.
    """
    s = s.strip()
    if profundidade <= 0 or not s:
        return [s] if s else []

    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = json.loads(s)
        except (ValueError, TypeError):
            interno = s.strip("[]").strip().strip('"').strip()
            return _desempacotar(interno, profundidade - 1) if interno != s else [s]
        if isinstance(parsed, list):
            itens: list[str] = []
            for x in parsed:
                itens.extend(_desempacotar(str(x), profundidade - 1))
            return itens
        return _desempacotar(str(parsed), profundidade - 1)

    if " | " in s:
        itens = []
        for parte in s.split(" | "):
            itens.extend(_desempacotar(parte, profundidade - 1))
        return itens

    return [s]


def normalizar_lista(v) -> str | None:
    """Desempacota `["A"]` -> `A` e `["A","B"]` -> `A | B`, descartando lixo.

    Mesma regra do endpoint /api/demandas/principios-ativos, para que a
    agregacao do dashboard case com o que e gravado aqui.
    """
    s = txt(v)
    if s is None:
        return None

    vistos: dict[str, None] = {}  # dedup preservando a ordem
    for item in _desempacotar(s):
        item = item.strip()
        if not _lixo(item):
            vistos.setdefault(item, None)

    return " | ".join(vistos) or None


def to_int(v, lo: int | None = None, hi: int | None = None) -> int | None:
    s = txt(v)
    if s is None:
        return None
    m = re.search(r"-?\d+", s)
    if not m:
        return None
    try:
        n = int(m.group())
    except ValueError:
        return None
    if lo is not None and n < lo:
        return None
    if hi is not None and n > hi:
        return None
    return n


def to_decimal(v) -> Decimal | None:
    """Valor monetario BR: '5.551.031,41' -> Decimal('5551031.41')."""
    if v is None:
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    s = str(v).strip()
    if not s:
        return None
    s = re.sub(r"[R$\s ]", "", s)
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def to_datetime(v) -> datetime | None:
    """Aceita '2024-08-01T16:14:32Z', '2024-08-01' e serial do Excel."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    if not s:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", s):  # serial Excel
        try:
            n = float(s)
        except ValueError:
            return None
        if n < 1 or n > 100000:
            return None
        base = datetime(1899, 12, 30, tzinfo=timezone.utc)
        return base.fromtimestamp(base.timestamp() + n * 86400, tz=timezone.utc)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        for fmt in ("%d/%m/%Y", "%d/%m/%Y %H:%M", "%Y/%m/%d"):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
        else:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if not (1990 <= dt.year <= 2100):
        return None
    return dt


def to_date(v) -> date | None:
    dt = to_datetime(v)
    return dt.date() if dt else None


# Numero CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO  (Resolucao CNJ 65/2008)
#   J  = segmento do Judiciario ("4" = Justica Federal)
#   TR = tribunal; para J=4, e a regiao do TRF (01..06)
CNJ_RE = re.compile(r"^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$")


def trf_do_processo(v) -> int | None:
    """Deriva a regiao do TRF a partir do numero do processo.

    As demandas de "Cumprimento de Ordem Judicial" — as unicas que trazem
    valor de deposito — nunca preenchem a coluna "TRF Regiao" no Redmine, o
    que deixava o grafico de valores por tribunal sem dados. O numero CNJ ja
    carrega essa informacao. Conferido contra as 49.191 linhas que tem os dois
    campos: 49.190 batem (99,998%); a unica divergencia e um numero com TR=40,
    inexistente, descartado pela faixa 1..TRF_MAX.
    """
    s = txt(v)
    if s is None:
        return None
    m = CNJ_RE.match(s)
    if not m or m.group(4) != "4":  # so Justica Federal
        return None
    tr = int(m.group(5))
    return tr if 1 <= tr <= TRF_MAX else None


def to_uf(v) -> str | None:
    s = txt(v)
    if s is None:
        return None
    u = s.upper().strip()
    return u if u in UFS else None


def to_regiao(v) -> str | None:
    s = txt(v)
    if s is None:
        return None
    return REGIAO_BRASIL.get(s.lower().strip())


def to_forma(v) -> str | None:
    s = txt(v)
    if s is None:
        return None
    key = (
        s.lower()
        .replace("ó", "o").replace("ã", "a").replace("ç", "c")
        .replace("á", "a").replace("é", "e").replace("í", "i")
        .strip()
    )
    return FORMA_CUMPRIMENTO.get(key)


# ------------------------------------------------------------------------ cuid

_CUID_COUNTER = random.randint(0, 36**4 - 1)
_CUID_FINGERPRINT = "".join(random.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(4))


def _b36(n: int, width: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return (out or "0")[-width:].rjust(width, "0")


def cuid() -> str:
    """cuid v1 (25 chars), mesmo formato que o Prisma gera para @default(cuid())."""
    global _CUID_COUNTER
    _CUID_COUNTER = (_CUID_COUNTER + 1) % (36**4)
    ts = _b36(int(time.time() * 1000), 8)
    cnt = _b36(_CUID_COUNTER, 4)
    rnd = _b36(random.getrandbits(40), 8)
    return f"c{ts}{cnt}{_CUID_FINGERPRINT}{rnd}"


# -------------------------------------------------------------- transformacao

class Stats:
    def __init__(self):
        self.total = 0
        self.emitidas = 0
        self.puladas_sem_id = 0
        self.puladas_dup = 0
        self.trf_descartado = Counter()
        self.trf_derivado = 0
        self.regiao_descartada = Counter()
        self.uf_descartada = Counter()
        self.criadoem_ausente = 0
        self.descricao_fallback = 0
        self.preenchidos = Counter()


def build_rows(xlsx: str, sistema_id: str, stats: Stats, limit: int | None = None):
    it = iter_rows(xlsx, limit=(limit + 1) if limit else None)
    header = next(it)
    idx = {h: i for i, h in enumerate(header) if h}

    def g(row, name):
        i = idx.get(name)
        if i is None or i >= len(row):
            return None
        return row[i]

    vistos: set[str] = set()
    agora = datetime.now(timezone.utc)

    for row in it:
        stats.total += 1

        rid = txt(g(row, "id"))
        if not rid:
            stats.puladas_sem_id += 1
            continue
        if rid in vistos:
            stats.puladas_dup += 1
            continue
        vistos.add(rid)

        titulo = txt(g(row, "subject")) or f"Demanda {rid}"
        descricao = txt(g(row, "description"))
        if descricao is None:
            descricao = titulo
            stats.descricao_fallback += 1

        numero_processo = txt(g(row, "Ação Judicial Originário"))

        # A coluna explicita do Redmine manda; o numero CNJ so entra como fallback.
        trf_raw = txt(g(row, "TRF Região"))
        trf = to_int(trf_raw, lo=1, hi=TRF_MAX)
        if trf is None:
            if trf_raw:
                stats.trf_descartado[trf_raw] += 1
            trf = trf_do_processo(numero_processo)
            if trf is not None:
                stats.trf_derivado += 1

        regiao_raw = txt(g(row, "Região Brasil"))
        regiao = to_regiao(regiao_raw)
        if regiao is None and regiao_raw:
            stats.regiao_descartada[regiao_raw] += 1

        uf_res_raw = txt(g(row, "UF_Residência "))
        uf_res = to_uf(uf_res_raw)
        if uf_res is None and uf_res_raw:
            stats.uf_descartada[uf_res_raw] += 1

        criado = to_datetime(g(row, "created_on"))
        if criado is None:
            stats.criadoem_ausente += 1
            criado = agora
        atualizado = to_datetime(g(row, "updated_on")) or criado

        rec = {
            "id": cuid(),
            "numero": rid,
            "titulo": titulo,
            "descricao": descricao,
            "projeto": txt(g(row, "project")),
            "ano": to_int(g(row, "Ano Ação Judicial"), lo=1990, hi=2100),
            "origemDemanda": txt(g(row, "tracker")),
            "status": txt(g(row, "status")),
            "prioridade": txt(g(row, "priority")),
            "pontoControle": txt(g(row, "Ponto de Controle")),
            "trfRegiao": trf,
            "ufResidencia": uf_res,
            "ufOcorrencia": to_uf(g(row, "UF")),
            "municipio": txt(g(row, "Município")),
            "tipoRepresentacaoJudicial": txt(g(row, "Tipo Representação Judicial")),
            "areaTematicaConsultor": txt(g(row, "Área Temática (Consultor)")),
            "areaFinalisticaMs": txt(g(row, "Áreas Finalísticas - MS")),
            "numeroExterno": rid,
            "areaTematica": txt(g(row, "Grupo Temático")),
            "regiaoBrasil": regiao,
            "objetoAcao": normalizar_lista(g(row, "Objeto da Ação")),
            "principioAtivo": normalizar_lista(g(row, "Princípio_Ativo")),
            "numeroProcesso": numero_processo,
            "dataEntradaDJUD": to_date(g(row, "Data de Entrada_DJUD")),
            "formaCumprimento": to_forma(g(row, "Forma de Cumprimento")),
            "valorEstimado": to_decimal(g(row, "Valor do Depósito (em reais)")),
            "dataInicio": to_date(g(row, "start_date")),
            "criadoPorId": sistema_id,
            "tags": [],
            "criadoEm": criado,
            "atualizadoEm": atualizado,
        }

        for k, v in rec.items():
            if v is not None and v != [] and v != "":
                stats.preenchidos[k] += 1

        stats.emitidas += 1
        yield rec


# ------------------------------------------------------------------ relatorio

def print_report(stats: Stats, elapsed: float) -> None:
    p = print
    p("")
    p("=" * 68)
    p("  RELATORIO DA TRANSFORMACAO")
    p("=" * 68)
    p(f"  linhas lidas na planilha .... {stats.total:>8,}")
    p(f"  registros prontos p/ carga .. {stats.emitidas:>8,}")
    if stats.puladas_sem_id:
        p(f"  puladas (sem id Redmine) ... {stats.puladas_sem_id:>8,}")
    if stats.puladas_dup:
        p(f"  puladas (id duplicado) ..... {stats.puladas_dup:>8,}")
    p(f"  tempo ....................... {elapsed:>8.1f}s")
    p("")
    p("  PREENCHIMENTO POR CAMPO")
    total = max(stats.emitidas, 1)
    for col in COLUMNS:
        n = stats.preenchidos.get(col, 0)
        pct = 100 * n / total
        barra = "#" * int(pct / 4)
        p(f"    {col:<28} {n:>7,}  {pct:>5.1f}%  {barra}")
    p("")
    p("  NORMALIZACOES (valores invalidos na origem -> NULL)")
    if stats.descricao_fallback:
        p(f"    descricao vazia -> usou o subject: {stats.descricao_fallback:,}")
    if stats.criadoem_ausente:
        p(f"    created_on ausente -> usou now(): {stats.criadoem_ausente:,}")
    if stats.trf_derivado:
        p(f"    TRF vazio -> derivado do numero CNJ: {stats.trf_derivado:,}")

    def show(titulo, counter, limite=10):
        if not counter:
            return
        tot = sum(counter.values())
        p(f"    {titulo}: {tot:,} linhas, {len(counter)} valores distintos")
        for k, v in counter.most_common(limite):
            p(f"        {v:>6,}  {k!r}")
        if len(counter) > limite:
            p(f"        ... e mais {len(counter) - limite} valores")

    show(f"TRF Regiao fora de 1-{TRF_MAX}", stats.trf_descartado)
    show("Regiao Brasil nao reconhecida", stats.regiao_descartada)
    show("UF_Residencia nao reconhecida", stats.uf_descartada)
    p("=" * 68)


# ------------------------------------------------------------------------- db

def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    for name in (".env.local", ".env", ".env.development.local"):
        f = Path(name)
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL"):
                _, _, val = line.partition("=")
                return val.strip().strip('"').strip("'")
    sys.exit(
        "ERRO: DATABASE_URL nao encontrada.\n"
        "  Defina no ambiente ou crie .env.local com:\n"
        "    DATABASE_URL=postgresql://user:senha@host.neon.tech/db?sslmode=require"
    )


def preflight(cur) -> None:
    """Confere que a tabela tem exatamente as colunas que o COPY vai escrever.

    Roda antes do DELETE: se o schema divergir, aborta sem destruir nada.
    """
    cur.execute(
        "SELECT column_name, is_nullable, column_default"
        " FROM information_schema.columns"
        " WHERE table_schema = 'public' AND table_name = 'Demanda'"
    )
    info = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    if not info:
        sys.exit('ERRO: tabela "Demanda" nao encontrada no schema public.')

    faltando = [c for c in COLUMNS if c not in info]
    if faltando:
        sys.exit(
            "ERRO: colunas do script ausentes na tabela Demanda: "
            + ", ".join(faltando)
            + "\n  Rode `prisma db push` ou ajuste COLUMNS no script."
        )

    # Colunas NOT NULL sem default que o COPY nao preenche quebrariam o insert.
    orfas = [
        c for c, (nullable, default) in info.items()
        if nullable == "NO" and default is None and c not in COLUMNS
    ]
    if orfas:
        sys.exit(
            "ERRO: colunas obrigatorias sem default nao preenchidas pelo COPY: "
            + ", ".join(orfas)
        )
    print(f"  preflight ok: {len(COLUMNS)} colunas conferidas")


def get_sistema_user(cur) -> str:
    cur.execute('SELECT id FROM "User" WHERE email = %s', (SISTEMA_EMAIL,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute('SELECT id FROM "User" WHERE name = %s LIMIT 1', ("SISTEMA",))
    row = cur.fetchone()
    if row:
        return row[0]
    uid = cuid()
    cur.execute(
        'INSERT INTO "User" (id, name, email, "emailVerified", role, password,'
        ' "createdAt", "updatedAt")'
        " VALUES (%s, %s, %s, now(), 'ADMIN', '', now(), now())",
        (uid, "SISTEMA", SISTEMA_EMAIL),
    )
    print(f"  usuario SISTEMA criado ({uid})")
    return uid


def backup(cur, outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for table in ("Demanda", "Attachment"):
        dest = outdir / f"{table}-{stamp}.csv"
        with dest.open("w", encoding="utf-8", newline="") as fh:
            with cur.copy(f'COPY "{table}" TO STDOUT WITH (FORMAT csv, HEADER true)') as cp:
                for chunk in cp:
                    fh.write(bytes(chunk).decode("utf-8", errors="replace"))
        print(f"  backup: {dest}  ({dest.stat().st_size:,} bytes)")


# ----------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file", default=DEFAULT_XLSX, help="planilha xlsx do Redmine")
    ap.add_argument("--dry-run", action="store_true", help="valida sem tocar no banco")
    ap.add_argument("--confirm", action="store_true", help="executa a carga (REPLACE)")
    ap.add_argument("--limit", type=int, default=0, help="processa apenas N linhas")
    ap.add_argument("--backup-dir", default="backups", help="destino do backup CSV")
    ap.add_argument("--no-backup", action="store_true", help="pula o backup (nao recomendado)")
    args = ap.parse_args()

    if not args.dry_run and not args.confirm:
        ap.error("informe --dry-run ou --confirm")

    xlsx = Path(args.file)
    if not xlsx.exists():
        sys.exit(f"ERRO: planilha nao encontrada: {xlsx}")

    limit = args.limit or None
    modo = "DRY-RUN (nada e gravado)" if args.dry_run else "REPLACE (apaga e recarrega)"
    print("")
    print(f"  planilha .. {xlsx.name}  ({xlsx.stat().st_size / 1e6:.1f} MB)")
    print(f"  modo ...... {modo}")
    if limit:
        print(f"  limite .... {limit:,} linhas")
    print("")

    stats = Stats()
    t0 = time.time()

    # ---- dry-run: so transforma e relata -------------------------------
    if args.dry_run:
        amostra = []
        for rec in build_rows(str(xlsx), "SISTEMA_DRY_RUN", stats, limit):
            if len(amostra) < 3:
                amostra.append(rec)
            if stats.emitidas % 10000 == 0:
                print(f"  ... {stats.emitidas:,} linhas", flush=True)
        print_report(stats, time.time() - t0)
        print("")
        print("  AMOSTRA (primeiros registros)")
        for rec in amostra:
            print("")
            for k in COLUMNS:
                v = rec[k]
                if v not in (None, [], ""):
                    print(f"    {k:<28} {v}")
        print("")
        print("  Nada foi gravado. Use --confirm para executar a carga.")
        return

    # ---- carga real ----------------------------------------------------
    import psycopg

    url = load_database_url()
    safe = re.sub(r"://[^@]*@", "://***@", url)
    print(f"  banco ..... {safe}")

    with psycopg.connect(url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM "Demanda"')
            antes = cur.fetchone()[0]
            cur.execute('SELECT count(*) FROM "Attachment"')
            anexos = cur.fetchone()[0]
            print(f"  estado atual: {antes:,} demandas, {anexos:,} anexos")

            preflight(cur)

            if not args.no_backup:
                print("")
                print("  gravando backup antes do DELETE...")
                backup(cur, Path(args.backup_dir))

            sistema_id = get_sistema_user(cur)

            print("")
            print("  apagando demandas existentes...")
            cur.execute('DELETE FROM "Demanda"')
            print(f"  removidas: {cur.rowcount:,}")

            print("  carregando planilha via COPY...")
            cols = ", ".join(f'"{c}"' for c in COLUMNS)
            with cur.copy(f'COPY "Demanda" ({cols}) FROM STDIN') as cp:
                for rec in build_rows(str(xlsx), sistema_id, stats, limit):
                    cp.write_row([rec[c] for c in COLUMNS])
                    if stats.emitidas % 10000 == 0:
                        print(f"  ... {stats.emitidas:,} linhas", flush=True)

            cur.execute('SELECT count(*) FROM "Demanda"')
            depois = cur.fetchone()[0]

        conn.commit()

    print_report(stats, time.time() - t0)
    print("")
    print(f"  demandas antes .... {antes:,}")
    print(f"  demandas depois ... {depois:,}")
    print(f"  variacao .......... {depois - antes:+,}")
    print("  COMMIT concluido.")


if __name__ == "__main__":
    main()
