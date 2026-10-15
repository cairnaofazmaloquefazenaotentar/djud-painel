#!/usr/bin/env python3
"""
Carga em lote da saída do Extrator-CATMAT-DA em public."DadosAbertosPreco" (P23).

Para classes inteiras (ex.: 6505) o caminho é o extrator na máquina do usuário;
a coleta pelo painel serve para atualizar UM CATMAT. As duas formas gravam com
o MESMO mapeamento (scripts/dados_abertos_mapear.py, espelho de
lib/dados-abertos/mapear.ts) e as MESMAS chaves — recarregar não muda o id de
nenhum registro, e as exclusões da curadoria continuam valendo.

Entradas aceitas (uma ou mais --arquivo):
  * .xlsx do extrator — aba "Dados CATMAT" (Compras.gov.br) e, na versão com
    interface, aba "BPS";
  * .csv do extrator (separador ";", UTF-8 com BOM) — o tipo é reconhecido pelo
    cabeçalho (idCompra → Compras.gov.br; codigoCatmat + nomeInstituicao → BPS).

Extraia com `--sem-descricao-bps` (ou desmarque "Usar a descrição do BPS"): a
coluna "Descrição do Item" do relatório precisa mostrar o que foi comprado (P25),
e a troca pela descrição do BPS não tem volta depois de gravada.

Uso:
    python scripts/import_extrator_da.py --arquivo dados_completos_extraidos_part1.xlsx --dry-run
    python scripts/import_extrator_da.py --arquivo saida.xlsx --integridade Relatorio_Integridade.xlsx --confirm
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dados_abertos_mapear import CAMPOS, mapear_bps, mapear_comprasgov  # noqa: E402
from precos_norm import normalizar_unidade  # noqa: E402

ABA_COMPRASGOV = "Dados CATMAT"
ABA_BPS = "BPS"


# ── Leitura ───────────────────────────────────────────────────────────────────

def _celula(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return v


def linhas_xlsx(caminho: Path):
    """(tipo, dict) de cada linha das abas reconhecidas."""
    from openpyxl import load_workbook

    wb = load_workbook(caminho, read_only=True, data_only=True)
    for nome in wb.sheetnames:
        tipo = "COMPRASGOV" if nome.startswith(ABA_COMPRASGOV) or nome.lower().startswith("da-") else (
            "BPS" if nome.strip().upper().startswith(ABA_BPS) else None
        )
        if tipo is None:
            continue
        it = wb[nome].iter_rows(values_only=True)
        cabecalho = [str(c).strip() if c is not None else "" for c in next(it, [])]
        for valores in it:
            if not valores or all(v in (None, "") for v in valores):
                continue
            yield tipo, nome, {k: _celula(v) for k, v in zip(cabecalho, valores) if k}


def linhas_csv(caminho: Path):
    texto = caminho.read_bytes().decode("utf-8-sig", errors="replace")
    leitor = csv.DictReader(io.StringIO(texto, newline=""), delimiter=";")
    campos = set(leitor.fieldnames or [])
    if "idCompra" in campos:
        tipo = "COMPRASGOV"
    elif "codigoCatmat" in campos and "nomeInstituicao" in campos:
        tipo = "BPS"
    else:
        print(f"  ! {caminho.name}: cabeçalho não reconhecido ({sorted(campos)[:6]}…) — ignorado")
        return
    for linha in leitor:
        yield tipo, caminho.name, linha


def ler(caminhos: list[Path]):
    for c in caminhos:
        if c.suffix.lower() in (".xlsx", ".xlsm"):
            yield from linhas_xlsx(c)
        elif c.suffix.lower() == ".csv":
            yield from linhas_csv(c)
        else:
            print(f"  ! {c.name}: extensão não suportada — ignorado")


def integridade(caminho: Path | None) -> dict[str, tuple[int, int, str]]:
    """Relatorio_Integridade do extrator: código → (esperados, baixados, status)."""
    if not caminho:
        return {}
    from openpyxl import load_workbook

    ws = load_workbook(caminho, read_only=True, data_only=True).active
    it = ws.iter_rows(values_only=True)
    next(it, None)
    saida = {}
    for r in it:
        if not r or r[0] in (None, ""):
            continue
        codigo = str(r[0]).strip().lstrip("0")
        saida[codigo] = (int(r[1] or 0), int(r[2] or 0), str(r[4] or ""))
    return saida


# ── Gravação ──────────────────────────────────────────────────────────────────

COLUNAS = CAMPOS + ["unidadeNorm", "bruto", "coletadoEm"]


def _valor_copy(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return "t" if v else "f"
    if isinstance(v, float) and v.is_integer():
        return repr(v)
    return str(v)


def gravar(conn, linhas: list[dict], coletas: list[dict]) -> None:
    lista = ", ".join(f'"{c}"' for c in COLUNAS)
    atualiza = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in COLUNAS if c != "id")
    with conn.cursor() as cur:
        cur.execute(f'CREATE TEMP TABLE carga (LIKE public."DadosAbertosPreco" INCLUDING DEFAULTS) ON COMMIT DROP')
        with cur.copy(f"COPY carga ({lista}) FROM STDIN") as cp:
            for l in linhas:
                cp.write_row([_valor_copy(l.get(c)) for c in COLUNAS])
        cur.execute(
            f'INSERT INTO public."DadosAbertosPreco" ({lista}) SELECT {lista} FROM carga '
            f"ON CONFLICT (id) DO UPDATE SET {atualiza}"
        )
        print(f"  {cur.rowcount} linha(s) inseridas ou atualizadas em DadosAbertosPreco")
        for c in coletas:
            cur.execute(
                'INSERT INTO public."DadosAbertosColeta" ("id", "origem", "codigoCatmat", "dataInicio", "dataFim", '
                '"assinatura", "status", "paginas", "esperados", "baixados", "erro", "origemCarga", "iniciadoEm", "concluidoEm") '
                "VALUES (%s, %s, %s, %s, %s, NULL, %s, 0, %s, %s, %s, 'EXTRATOR', %s, %s)",
                (
                    c["id"], c["origem"], c["catmat"], c["inicio"], c["fim"], c["status"],
                    c["esperados"], c["baixados"], c["erro"], c["agora"], c["agora"],
                ),
            )
        print(f"  {len(coletas)} carga(s) registradas em DadosAbertosColeta (origemCarga = EXTRATOR)")
    conn.commit()


# ── Principal ─────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--arquivo", action="append", required=True, type=Path, help="saída do extrator (.xlsx ou .csv); pode repetir")
    ap.add_argument("--integridade", type=Path, help="Relatorio_Integridade.xlsx do extrator (esperados × baixados)")
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--dry-run", action="store_true", help="lê, mapeia e relata; não grava")
    grupo.add_argument("--confirm", action="store_true", help="grava no banco")
    args = ap.parse_args()

    agora = datetime.now(timezone.utc).replace(tzinfo=None)
    por_id: dict[str, dict] = {}
    rejeitados = Counter()
    exemplos_rejeicao: dict[str, str] = {}
    lidas = Counter()
    por_catmat = defaultdict(lambda: {"linhas": 0, "datas": []})

    for tipo, origem_arquivo, item in ler(args.arquivo):
        lidas[tipo] += 1
        m = mapear_comprasgov(item, "EXTRATOR") if tipo == "COMPRASGOV" else mapear_bps(item, "EXTRATOR")
        if not m["ok"]:
            rejeitados[tipo] += 1
            exemplos_rejeicao.setdefault(tipo, f"{origem_arquivo}: {m['erro']}")
            continue
        linha = m["linha"]
        linha["unidadeNorm"] = normalizar_unidade(linha["unidade"]) if linha["unidade"] else None
        linha["bruto"] = json.dumps({k: (v if not isinstance(v, (datetime, date)) else str(v)) for k, v in item.items()}, ensure_ascii=False, default=str)
        linha["coletadoEm"] = agora.isoformat(sep=" ")
        por_id[linha["id"]] = linha
        chave = (linha["origem"], linha["codigoCatmat"])
        por_catmat[chave]["linhas"] += 1
        if linha["dataCompra"]:
            por_catmat[chave]["datas"].append(linha["dataCompra"])

    print(f"Lidas: {dict(lidas)} · rejeitadas: {dict(rejeitados)} · distintas (por id): {len(por_id)}")
    for tipo, ex in exemplos_rejeicao.items():
        print(f"  ex. rejeição {tipo}: {ex}")

    integ = integridade(args.integridade)
    coletas = []
    print(f"\n{'origem':<11} {'CATMAT':>8} {'linhas':>7} {'esperados':>9} {'baixados':>8}  período")
    for (origem, catmat), info in sorted(por_catmat.items()):
        datas = sorted(info["datas"])
        # O relatório de integridade do extrator é do Compras.gov.br.
        esp, bx, st = integ.get(catmat, (None, None, "")) if origem == "COMPRASGOV" else (None, None, "")
        status = "OK"
        erro = None
        if origem == "COMPRASGOV" and esp is not None and info["linhas"] < esp:
            status = "PARCIAL"
            erro = f"extrator: {st} — {info['linhas']} de {esp} registro(s)"
        print(f"{origem:<11} {catmat:>8} {info['linhas']:>7} {esp if esp is not None else '—':>9} {bx if bx is not None else '—':>8}  {datas[0] if datas else '—'} a {datas[-1] if datas else '—'}")
        coletas.append({
            "id": f"extrator-{origem.lower()}-{catmat}-{agora.strftime('%Y%m%d%H%M%S')}",
            "origem": origem,
            "catmat": catmat,
            "inicio": datas[0] if datas else agora.date().isoformat(),
            "fim": datas[-1] if datas else agora.date().isoformat(),
            "status": status,
            "esperados": esp,
            "baixados": info["linhas"],
            "erro": erro,
            "agora": agora,
        })

    if args.dry_run:
        amostra = next(iter(por_id.values()), None)
        if amostra:
            print("\nExemplo de linha mapeada:")
            for c in ("id", "origem", "codigoCatmat", "numeroCompra", "codigoUasg", "numeroItemCompra", "unidade", "unidadeNorm", "precoUnitario", "dataCompra", "modalidade"):
                print(f"  {c:<18} {amostra.get(c)}")
        print("\n--dry-run: nada gravado.")
        return 0

    import psycopg
    from import_redmine_base import load_database_url

    with psycopg.connect(load_database_url()) as conn:
        gravar(conn, list(por_id.values()), coletas)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
