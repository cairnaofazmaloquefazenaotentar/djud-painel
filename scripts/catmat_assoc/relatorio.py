"""
Abas da planilha de revisao (secao 7, item 2) e o resumo impresso no terminal.

Resumo · Nível A · Nível B · Nível C · Nível D · Fora · Não tem → possível CATMAT · Conflitos ·
Suspeitas na GP · Pontes aprendidas · Backtest
"""

from __future__ import annotations

from collections import Counter

from .backtest import resumo_cego
from .catalogo import sem_rotulos
from .guardas import avaliar
from .normaliza import nome_base

CAB_BASE = ["Registro", "nº", "Linha GP", "Vigente ago", "Substância", "Produto", "Apresentação", "Classe terapêutica"]


def _base(p_or_r, vigentes) -> list:
    r = p_or_r.registro if hasattr(p_or_r, "nivel") else p_or_r
    return [r.registro, r.gp.n, r.gp.linha if r.gp.linha > 0 else "nova", "sim" if r.registro in vigentes else "não",
            r.substancia, r.produto, r.apresentacao, r.classe]


def _desc(cat, c):
    it = cat.get(c) if c else None
    return sem_rotulos(it.descricao) if it else ""


def _cand_txt(c) -> str:
    it, av = c.item, c.av
    rep = "; ".join(g.motivo or g.codigo for g in av.reprovadas())
    return (f"{it.codigo} [{it.situacao or '?'}|{av.grau if av.aprovado else 'essencial'}] {sem_rotulos(it.descricao)}"
            + (f" — contraria: {rep}" if rep else ""))


def tipo_desacordo(ctx, r, prev: int, gp_c: int) -> str:
    cat, P = ctx.cat, ctx.P
    a, b = cat.get(prev), cat.get(gp_c)
    if not a or not b:
        return "código ausente"
    av_p, av_g = avaliar(r, a, P, cat), avaliar(r, b, P, cat)
    if av_p.aprovado and not av_g.aprovado:
        return "provável erro da GP (" + "; ".join(g.motivo for g in av_g.reprovadas())[:120] + ")"
    if a.pdm == b.pdm and av_p.aprovado and av_g.aprovado:
        if a.acessorios != b.acessorios:
            return "acessório/volume não capturado (" + "/".join(sorted(a.acessorios ^ b.acessorios)) + ")"
        return "duplicata do catálogo (ou quase): mesmo PDM, os dois passam nas guardas"
    if not av_p.aprovado:
        return "proposta reprovada nas guardas (não deveria ser A)"
    return "a investigar"


def montar_abas(ctx, propostas: dict, nao_tem: list, susp: list, bt, bti, cego, vigentes: set, data: str):
    cat = ctx.cat
    ps = list(propostas.values())
    niveis = Counter(p.nivel for p in ps)
    abas = []

    # Nivel A
    cab_a = CAB_BASE + ["CATMAT", "Descrição", "Unidade", "Qt_Embal", "Método", "Aderência", "Evidência", "Alertas",
                        "Guardas"]
    la = [_base(p, vigentes) + [p.catmat, _desc(cat, p.catmat), p.unidade, p.qt, p.metodo, p.aderencia, p.evidencia,
                                 " | ".join(p.alertas), p.avaliacao.resumo() if p.avaliacao else ""]
          for p in ps if p.nivel == "A"]
    # Nivel B
    cab_b = CAB_BASE + ["CATMAT proposto", "Descrição", "Unidade", "Qt_Embal", "Método", "Motivo do B", "Opções (CATMAT ×vínculos, raízes)",
                        "Candidatos do catálogo (top 3)", "Alertas"]
    lb = []
    for p in ps:
        if p.nivel != "B":
            continue
        ops = " || ".join(f"{o.catmat} ×{o.n} ({o.raizes} raízes){' ' + o.motivo if o.motivo else ''}: {_desc(cat, o.catmat)}"
                          for o in p.opcoes[:4])
        cs = " || ".join(_cand_txt(c) for c in p.candidatos[:3])
        lb.append(_base(p, vigentes) + [p.catmat, _desc(cat, p.catmat), p.unidade, p.qt, p.metodo, p.evidencia, ops, cs,
                                        " | ".join(p.alertas)])
    # Nivel C
    cab_c = CAB_BASE + ["CATMAT", "Descrição", "Unidade", "Qt_Embal", "Aderência (R14)", "Decisão/justificativa",
                        "Regras", "Top 3 candidatos", "Guardas", "Alertas", "Precedente"]
    lc = [_base(p, vigentes) + [p.catmat, _desc(cat, p.catmat), p.unidade, p.qt, p.aderencia, p.evidencia,
                                 ", ".join(p.regras), " || ".join(_cand_txt(c) for c in p.candidatos[:3]),
                                 p.avaliacao.resumo() if p.avaliacao else "", " | ".join(p.alertas), p.precedente]
          for p in ps if p.nivel == "C"]
    # Nivel D
    cab_d = CAB_BASE + ["Justificativa", "Busca feita", "Itens ativos mais próximos (e o que contrariam)",
                        "Rascunho do pedido de CATMAT", "xxx"]
    ld = []
    for p in ps:
        if p.nivel != "D":
            continue
        prox = [c for c in p.candidatos if c.item.ativo][:3]
        ld.append(_base(p, vigentes) + [p.evidencia, " · ".join(p.busca[:30]),
                                        " || ".join(_cand_txt(c) for c in prox) or "nenhum item ativo com o princípio ativo",
                                        p.rascunho, "planilhar"])
    lf = [_base(p, vigentes) + [p.evidencia] for p in ps if p.nivel == "Fora"]

    # Nao tem -> possivel CATMAT
    cab_nt = CAB_BASE + ["xxx", "Conflito (irmão/gêmeo vinculado)", "Precedente", "Candidato", "Descrição", "Grau R14",
                         "Notas", "Código ≥ 600000", "Outras opções", "Guardas do candidato"]
    lnt, lconf = [], []
    for r, info in nao_tem:
        m = info["melhor"]
        row = _base(r, vigentes) + [r.gp.xxx, "sim" if info["conflito"] else "", info["precedente"],
                                    m.item.codigo if m else None, sem_rotulos(m.item.descricao) if m else "",
                                    m.av.grau if m else "", "; ".join(m.av.notas) if m else "",
                                    "sim" if m and m.item.codigo >= 600000 else "",
                                    " || ".join(_cand_txt(c) for c in info["outros"]),
                                    m.av.resumo() if m else ""]
        if m or info["conflito"]:
            lnt.append(row)
        if info["conflito"]:
            top = info["precedente_top"]
            lconf.append(_base(r, vigentes) + [r.gp.xxx, info["precedente"], top, _desc(cat, top),
                                                m.item.codigo if m else None])
    ordem = {"exato": 0, "equivalente": 1, "aproximado": 2, "": 3}
    lnt.sort(key=lambda x: (x[3] != "sim", ordem.get(x[13], 3)))
    cab_conf = CAB_BASE + ["xxx", "Precedente", "CATMAT do irmão/gêmeo", "Descrição", "Melhor candidato do catálogo"]

    # Suspeitas na GP
    cab_s = CAB_BASE + ["CATMAT na GP", "Descrição", "Guardas reprovadas", "Atributos essenciais contrariados"]
    ls = [_base(r, vigentes) + [c, _desc(cat, c), "; ".join(str(g) for g in av.reprovadas()) if av else "fora do catálogo",
                                "; ".join(av.essenciais) if av else ""] for r, c, av in susp]

    # Pontes aprendidas
    cab_p = ["Tipo", "De (CMED)", "Para (catálogo)", "Vínculos"]
    lp = []
    for ing, cont in sorted(ctx.P.ing_pdm.items()):
        for pdm, n in cont.most_common():
            if pdm != ing and pdm != nome_base(ing):
                lp.append(["ingrediente → PDM", ing, pdm, n])
    for k, cont in sorted(ctx.P.forma_un.items(), key=lambda x: -sum(x[1].values()))[:300]:
        for un, n in cont.most_common(3):
            lp.append(["forma/recipiente → unidade", " · ".join(str(x) for x in k), un, n])

    # Backtest
    cab_bt = ["Seção", "Métrica / registro", "n", "Cobertura", "Acerto", "Previsto", "GP", "Tipo provável", "Evidência"]
    lbt = []
    if bt:
        for nome, n, cob, ac in bt.linhas():
            lbt.append(["6.1 GroupKFold por raiz", nome, n, round(cob, 4), round(ac, 4)])
    if bti:
        for nome, n, cob, ac in bti.linhas():
            lbt.append(["6.1 irmãos (deixa-um-de-fora)", nome, n, round(cob, 4), round(ac, 4)])
    for fonte, res in (("6.1 desacordo A (GroupKFold)", bt), ("6.1 desacordo A (irmão)", bti)):
        if not res:
            continue
        for r, prev, gpc, metodo, ev in res.desacordos_a:
            lbt.append([fonte, f"{r.registro} {r.substancia} | {r.apresentacao}", None, None, None,
                        f"{prev} {_desc(cat, prev)}", f"{gpc} {_desc(cat, gpc)}", tipo_desacordo(ctx, r, prev, gpc), ev])
    if cego:
        rc = resumo_cego(cego)
        lbt.append(["6.2 às cegas", f"top-1 do ranqueador", rc["n"], None, round(rc["top1"] / rc["n"], 4)])
        lbt.append(["6.2 às cegas", f"top-3", rc["n"], None, round(rc["top3"] / rc["n"], 4)])
        lbt.append(["6.2 às cegas", f"CATMAT correto entre os candidatos (até 10)", rc["n"], None,
                    round(rc["recall10"] / rc["n"], 4)])
        for r, c, cs, _ in cego:
            cods = [x.item.codigo for x in cs]
            if cods and cods[0] == c:
                continue
            pos = cods.index(c) + 1 if c in cods else None
            lbt.append(["6.2 erro às cegas", f"{r.registro} {r.substancia} | {r.apresentacao}", pos, None, None,
                        f"{cods[0]} {_desc(cat, cods[0])}" if cods else "sem candidato", f"{c} {_desc(cat, c)}",
                        tipo_desacordo(ctx, r, cods[0], c) if cods else "sem candidato", ""])

    resumo = [
        ["Data da rodada", data],
        ["Fila (backlog + novos)", len(ps)],
        ["Nível A (automático, colunas H–K)", niveis.get("A", 0)],
        ["Nível B (revisão, com opções)", niveis.get("B", 0)],
        ["Nível C (adjudicado, revisão humana)", niveis.get("C", 0)],
        ["Nível D (Não tem → pedido de CATMAT)", niveis.get("D", 0)],
        ["Fora (R12)", niveis.get("Fora", 0)],
        ["Pendentes de adjudicação (C/D sem decisão)", sum(1 for p in ps if "pendente de adjudicação" in p.alertas)],
        ["Vigentes na lista atual (na fila)", sum(1 for p in ps if p.registro.registro in vigentes)],
        ['"Não tem" revisados', len(nao_tem)],
        ['"Não tem" com candidato ativo aprovado nas guardas', sum(1 for _, i in nao_tem if i["melhor"])],
        ['"Não tem" em conflito (irmão/gêmeo unânime vinculado)', len(lconf)],
        ["Suspeitas na GP (vínculos reprovados nas guardas)", len(ls)],
    ]
    for p_ in ("exato", "equivalente", "aproximado"):
        resumo.append([f"  aderência {p_} (A/B/C)", sum(1 for p in ps if p.aderencia == p_)])
    if bt:
        for nome, n, cob, ac in bt.linhas():
            if nome.startswith("Nível"):
                resumo.append([f"Backtest 6.1 {nome}", f"cobertura {cob:.1%} · acerto {ac:.2%} (n={n})"])
    if bti:
        for nome, n, cob, ac in bti.linhas():
            if nome.startswith("Nível A"):
                resumo.append([f"Backtest irmão {nome}", f"cobertura {cob:.1%} · acerto {ac:.2%} (n={n})"])
    if cego:
        rc = resumo_cego(cego)
        resumo.append(["Backtest 6.2 às cegas (ranqueador)", f"top-1 {rc['top1']}/{rc['n']} · top-3 {rc['top3']}/{rc['n']} · "
                                                            f"entre os candidatos {rc['recall10']}/{rc['n']}"])

    abas = [
        ("Resumo", ["Item", "Valor"], resumo),
        ("Nível A", cab_a, la),
        ("Nível B", cab_b, lb),
        ("Nível C", cab_c, lc),
        ("Nível D", cab_d, ld),
        ("Fora", CAB_BASE + ["Evidência"], lf),
        ("Não tem → possível CATMAT", cab_nt, lnt),
        ("Conflitos", cab_conf, lconf),
        ("Suspeitas na GP", cab_s, ls),
        ("Pontes aprendidas", cab_p, lp),
        ("Backtest", cab_bt, lbt),
    ]
    return abas, resumo


def imprimir_resumo(resumo: list, log=print) -> None:
    log("\n=== Resumo ===")
    for k, v in resumo:
        log(f"  {k}: {v}")
