#!/usr/bin/env python3
"""
Associador Registro ANVISA x CATMAT da Grande Padrao (GP) da CMED.

Para cada registro da GP ainda sem CATMAT (e para cada registro novo da lista mensal),
propoe CATMAT + Descricao + Unidade de fornecimento + Qt_Embal, com nivel de confianca e
evidencia. So o nivel A (precedente unanime da GP, guardas G1-G7 aprovadas, >= 99,5% de
acerto medido em backtest) vai para as colunas oficiais H-K, e so numa COPIA da GP.

Niveis:
  A     irmao (mesma raiz) ou gemeos de >= 2 raizes, CATMAT unanime, Ativo, guardas ok -> automatico
  B     precedente fraco/divergente, CATMAT inativo, guarda reprovada ou agente sem escolha inequivoca
  C     sem precedente: candidato do catalogo adjudicado pelo agente (exato/equivalente/aproximado, R14)
  D     "Nao tem" no fim da escada R14, com a busca feita e o rascunho do pedido de CATMAT novo
  Fora  produto de teste da ANVISA (R12)

Uso (planilhas fora do git; saidas em saida_catmat/):
    python scripts/associar_catmat.py --gp "01. CMED - grande.padrão - de jan.17 a ago.26.xlsx" \\
        --catalogo "Catmats 11-07.CSV" --unidades "Extração Unidades de Fornecimento 29-09.csv" \\
        --lista 08.26.xlsx --dry-run
    ... --confirm --backtest --revisar-nao-tem          # grava proposta, revisao, pacotes
    ... --confirm --backtest-cego                        # + validacao as cegas 6.2 (lenta, ~25 min)

Fluxo mensal: entra a lista nova (--lista), saem as linhas novas da GP ja associadas. O agente
adjudica os pacotes do nivel C (saida_catmat/pacotes/*.json) e grava saida_catmat/decisoes_catmat.csv;
a rodada seguinte rele as decisoes. Decisao com autor diferente de "agente" (confirmada pelo
usuario) vira precedente, assim como a GP ja corrigida.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catmat_assoc import adjudicacao as ADJ  # noqa: E402
from catmat_assoc import backtest as BT  # noqa: E402
from catmat_assoc import candidatos as CAND  # noqa: E402
from catmat_assoc import fluxo as FL  # noqa: E402
from catmat_assoc import leitura as LE  # noqa: E402
from catmat_assoc import precedente as PREC  # noqa: E402
from catmat_assoc.catalogo import Catalogo  # noqa: E402
from catmat_assoc.normaliza import limpar  # noqa: E402
from catmat_assoc.relatorio import montar_abas, imprimir_resumo  # noqa: E402
from catmat_assoc.saida import gravar_proposta, gravar_revisao  # noqa: E402


def log(msg: str) -> None:
    print(msg, flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gp", required=True, help="Grande Padrão (.xlsx) — nunca é sobrescrita")
    ap.add_argument("--catalogo", required=True, help='"Catmats 11-07.CSV" (separador @, cp1252)')
    ap.add_argument("--unidades", required=True, help='"Extração Unidades de Fornecimento" (separador @, cp1252)')
    ap.add_argument("--lista", help="lista mensal da CMED mais recente (ex.: 08.26.xlsx)")
    ap.add_argument("--saida", default="saida_catmat", help="pasta de saída (fora do git)")
    ap.add_argument("--decisoes", help="decisoes_catmat.csv (padrão: <saida>/decisoes_catmat.csv)")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--dry-run", action="store_true", help="processa e mostra o resumo, sem gravar nada")
    modo.add_argument("--confirm", action="store_true", help="grava as saídas em --saida")
    ap.add_argument("--backtest", action="store_true", help="validação 6.1 (GroupKFold por raiz + irmãos)")
    ap.add_argument("--backtest-cego", action="store_true", help="validação 6.2 às cegas (150 + 50 vínculos)")
    ap.add_argument("--somente-vigentes", action="store_true", help="fila só com registros da lista atual")
    ap.add_argument("--revisar-nao-tem", action="store_true", help='aba "Não tem → possível CATMAT" (P3)')
    ap.add_argument("--data", default=dt.date.today().isoformat(), help="data da rodada (AAAA-MM-DD)")
    args = ap.parse_args()

    t0 = time.time()
    saida = Path(args.saida)
    dec_path = Path(args.decisoes) if args.decisoes else saida / "decisoes_catmat.csv"

    # 1. leitura ----------------------------------------------------------------
    log("[1/7] Lendo arquivos…")
    gp = LE.ler_gp(args.gp)
    lista = LE.ler_lista(args.lista) if args.lista else None
    descricoes = LE.ler_catalogo(args.catalogo)
    unidades = LE.ler_unidades(args.unidades)
    st = Counter(l.status for l in gp.linhas)
    log(f"  GP: {len(gp.linhas)} registros (cabeçalho na linha {gp.linha_cabecalho}); "
        f"CATMAT numérico {st['num']} · Não tem {st['Não tem']} · vazio {st['vazio']} · Fora {st['Fora']} · outro {st['outro']}")
    if lista:
        log(f"  Lista: {len(lista.linhas)} linhas, {len(lista.por_registro)} registros ({lista.publicada or 'sem data'})")
    sit = Counter(s.situacao for s in unidades.values())
    log(f"  Catálogo: {len(descricoes)} itens · extração: {len(unidades)} CATMATs ({dict(sit)})")

    # 2. catalogo e contexto ------------------------------------------------------
    log("[2/7] Montando catálogo, pontes e precedentes…")
    cat = Catalogo(descricoes, unidades)
    decisoes = ADJ.ler_decisoes(dec_path)
    if decisoes:
        log(f"  {len(decisoes)} decisões lidas de {dec_path}")
    ctx = FL.preparar(gp, lista, cat, decisoes)
    log(f"  {len(ctx.links)} vínculos de precedente · {len(ctx.P.ing_pdm)} ingredientes com ponte")

    # 3. fila -----------------------------------------------------------------------
    log("[3/7] Montando a fila…")
    fila = []
    novas = []
    if lista:
        n_max = max((l.n or 0) for l in gp.linhas)
        for reg, lsts in lista.por_registro.items():
            if reg not in ctx.regs:
                n_max += 1
                r = FL.registro_novo(ctx, lsts[0], n_max)
                fila.append(r)
                novas.append(r)
    vigentes = set(lista.por_registro) if lista else set()
    for r in ctx.regs.values():
        if r.gp.status == "vazio" and (not args.somente_vigentes or r.registro in vigentes):
            fila.append(r)
    fila.sort(key=lambda r: (r.registro not in vigentes, r.gp.linha))
    log(f"  registros novos: {len(novas)} · backlog (CATMAT vazio): {len(fila) - len(novas)}")

    # 4. processamento --------------------------------------------------------------
    log("[4/7] Associando…")
    propostas = {}
    for i, r in enumerate(fila, 1):
        propostas[r.registro] = FL.processar(ctx, r)
        if i % 100 == 0:
            log(f"  {i}/{len(fila)}")
    niveis = Counter(p.nivel for p in propostas.values())
    log("  níveis: " + " · ".join(f"{k} {niveis.get(k, 0)}" for k in ("A", "B", "C", "D", "Fora")))

    # 5. revisao dos Nao tem e suspeitas ------------------------------------------------
    nao_tem = []
    if args.revisar_nao_tem:
        log("[5/7] Revisando os \"Não tem\" (P3)…")
        nt = [r for r in ctx.regs.values() if r.gp.status == "Não tem"]
        nt.sort(key=lambda r: (r.registro not in vigentes, r.gp.linha))
        for i, r in enumerate(nt, 1):
            nao_tem.append((r, FL.revisar_nao_tem(ctx, r)))
            if i % 200 == 0:
                log(f"  {i}/{len(nt)}")
    else:
        log("[5/7] (revisão dos \"Não tem\" desligada: use --revisar-nao-tem)")
    log("  guardas sobre os vínculos existentes (Suspeitas na GP)…")
    susp = FL.suspeitas(ctx)

    # 6. backtests ------------------------------------------------------------------------
    bt = bti = cego = None
    unidade_de = {r.registro: r.gp.unidade for r, _ in ctx.links}
    vinc_gp = [(r, c) for r, c in ctx.links if r.gp.status == "num"]
    if args.backtest:
        log("[6/7] Backtest 6.1 (GroupKFold por raiz, 5 dobras)…")
        bt = BT.backtest_precedente(vinc_gp, cat, PREC.decidir, unidade_de, log=log)
        bti = BT.backtest_irmao(vinc_gp, cat, PREC.decidir, unidade_de, log=log)
    if args.backtest_cego:
        log("[6/7] Backtest 6.2 às cegas…")
        amostra = BT.amostra_cega(vinc_gp)
        cego = BT.backtest_cego(amostra, vinc_gp, cat, lambda r, c, P: CAND.gerar(r, c, P), log=log)

    # 7. saidas ------------------------------------------------------------------------------
    abas, resumo = montar_abas(ctx, propostas, nao_tem, susp, bt, bti, cego, vigentes, args.data)
    imprimir_resumo(resumo, log)
    if args.dry_run:
        log(f"\n[dry-run] nada gravado. {time.time() - t0:.0f}s")
        return 0
    log("[7/7] Gravando saídas…")
    competencia = args.data[:7]
    saida.mkdir(parents=True, exist_ok=True)
    pacotes = saida / "pacotes"
    n_pac = 0
    for p in propostas.values():
        if p.nivel in ("C", "D") or (p.nivel == "B" and p.metodo == "adjudicação"):
            pk = ADJ.pacote(p.registro, p.candidatos, p.busca,
                            ADJ.vinculos_da_substancia(p.registro, ctx.vinculos_por_ing, cat), p.precedente)
            ADJ.salvar_pacote(pacotes, pk)
            n_pac += 1
    novas_linhas = [{"n": r.gp.n, "registro": int(r.registro) if r.registro.isdigit() else r.registro, "gen": r.gp.gen,
                     "icms": r.gp.icms, "substancia": r.gp.substancia, "produto": r.gp.produto,
                     "apresentacao": r.gp.apresentacao, "cnpj": r.gp.cnpj, "fabricante": r.gp.fabricante}
                    for r in novas]
    cont = gravar_proposta(gp, {k: v for k, v in propostas.items() if v.registro.gp.linha > 0},
                           lambda c: FL.descricao_proposta(cat, c),
                           saida / f"grande.padrao.{competencia}.proposta.xlsx", args.data, novas_linhas)
    gravar_revisao(saida / f"revisao_catmat_{competencia}.xlsx", abas)
    if not dec_path.exists():
        ADJ.gravar_decisoes(dec_path, [])
    log(f"  proposta: {cont} · pacotes: {n_pac} · revisão: {len(abas)} abas · {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
