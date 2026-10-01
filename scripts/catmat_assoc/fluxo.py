"""
Fluxo de uma rodada (secoes 5.1 a 5.6 do prompt), usado pela CLI scripts/associar_catmat.py.

  preparar()        registros, vinculos (GP + decisoes confirmadas), pontes, indice de precedentes
  processar()       um registro da fila -> Proposta (Fora / A / B / C / D)
  fornecimento()    unidade oficial + Qt_Embal da proposta (sem unidade compativel: A cai para B)
  revisar_nao_tem() um "Nao tem" -> melhor CATMAT ativo possivel (P3: nunca automatico)
  suspeitas()       guardas sobre os vinculos existentes (so lista; corrigir esta fora do escopo)
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from . import candidatos as CAND
from . import precedente as PREC
from .adjudicacao import Decisao
from .catalogo import Catalogo, sem_rotulos
from .fornecimento import escolher_unidade, qt_alerta, qt_embalagem
from .guardas import avaliar, unidades_compativeis
from .leitura import GrandePadrao, LinhaGP, ListaMensal
from .normaliza import limpar, nome_base
from .pontes import Pontes, aprender
from .proposta import Opcao, Proposta
from .registro import Registro, montar


@dataclass
class Contexto:
    gp: GrandePadrao
    lista: ListaMensal | None
    cat: Catalogo
    regs: dict[str, Registro]
    links: list[tuple[Registro, int]]
    P: Pontes
    idx: PREC.IndicePrecedente
    decisoes: dict[str, Decisao]
    vinculos_por_ing: dict[str, Counter] = field(default_factory=dict)
    idx_nao_tem: PREC.IndicePrecedente | None = None  # irmaos/gemeos que a equipe marcou "Nao tem"


def confirmada(d: Decisao) -> bool:
    """Decisao vira precedente quando confirmada pelo usuario (autor diferente de 'agente')."""
    return d.decisao == "CATMAT" and len(d.catmats) == 1 and not limpar(d.autor).startswith("AGENTE")


def preparar(gp: GrandePadrao, lista: ListaMensal | None, cat: Catalogo, decisoes: dict[str, Decisao]) -> Contexto:
    regs: dict[str, Registro] = {}
    for l in gp.linhas:
        lst = (lista.por_registro.get(l.registro) or [None])[0] if lista else None
        regs[l.registro] = montar(l, lst)
    links = [(r, r.gp.catmat) for r in regs.values() if r.gp.status == "num"]
    extra = [(regs[k], d.catmats[0]) for k, d in decisoes.items() if k in regs and confirmada(d)
             and regs[k].gp.status != "num" and d.catmats[0] in cat]
    links_todos = links + extra
    unidade_de = {r.registro: r.gp.unidade for r, _ in links}
    P = aprender([(r, cat.get(c)) for r, c in links_todos if cat.get(c)], unidade_de)
    idx = PREC.IndicePrecedente(links_todos)
    vpi: dict[str, Counter] = defaultdict(Counter)
    for r, c in links_todos:
        for i in r.ingredientes:
            vpi[i][c] += 1
    idx_nt = PREC.IndicePrecedente([(r, 0) for r in regs.values() if r.gp.status == "Não tem"])
    return Contexto(gp, lista, cat, regs, links_todos, P, idx, decisoes, vpi, idx_nt)


def evidencia_nao_tem(ctx: Contexto, r: Registro) -> str:
    if ctx.idx_nao_tem is None:
        return ""
    p = ctx.idx_nao_tem.consultar(r)
    if p.metodo in ("nenhum", "assinatura"):
        return ""
    n = sum(p.contagem.values())
    return f"{p.metodo}: {n} registro(s) com a mesma apresentação marcados \"Não tem\" pela equipe ({', '.join(p.registros.get(0, [])[:4])})"


def registro_novo(ctx: Contexto, lst, n: int) -> Registro:
    """Linha da lista mensal que ainda nao esta na GP vira linha nova (secao 5.1, item 1)."""
    gen = "SIM" if limpar(lst.tipo).startswith("GENERICO") else "NÃO"
    icms = "Sim" if limpar(lst.icms0) in ("SIM", "S") else "Não"
    l = LinhaGP(linha=-1, n=n, registro=lst.registro, gen=gen, icms=icms, catmat_bruto=None, descricao=None,
                unidade=None, qt=None, xxx=None, substancia=lst.substancia, produto=lst.produto,
                apresentacao=lst.apresentacao, cnpj=lst.cnpj, fabricante=lst.laboratorio)
    return montar(l, lst)


# ---------------------------------------------------------------------------
# Rascunho de pedido de CATMAT novo (R11)

FORMA_CAT = [
    (lambda f: f.base == "COMPRIMIDO" and "ORODISP" in f.mods, "COMPRIMIDO ORODISPERSÍVEL"),
    (lambda f: f.base == "COMPRIMIDO" and "MAST" in f.mods, "COMPRIMIDO MASTIGÁVEL"),
    (lambda f: f.base == "COMPRIMIDO" and "EFEV" in f.mods, "COMPRIMIDO EFERVESCENTE"),
    (lambda f: f.base == "COMPRIMIDO" and "SUBL" in f.mods, "COMPRIMIDO SUBLINGUAL"),
    (lambda f: f.base == "COMPRIMIDO" and "DISP" in f.mods, "COMPRIMIDO DISPERSÍVEL"),
    (lambda f: f.base == "COMPRIMIDO" and f.lib == "PROL", "COMPRIMIDO DE LIBERAÇÃO PROLONGADA"),
    (lambda f: f.base == "COMPRIMIDO" and f.lib == "RETARD", "COMPRIMIDO DE LIBERAÇÃO RETARDADA"),
    (lambda f: f.base == "COMPRIMIDO", "COMPRIMIDO REVESTIDO"),
    (lambda f: f.base == "CAPSULA" and f.lib, "CÁPSULA DE LIBERAÇÃO PROLONGADA"),
    (lambda f: f.base == "CAPSULA", "CÁPSULA"),
    (lambda f: f.base == "PO" and "LIOF" in f.mods and "INJ" in f.vias, "PÓ LIÓFILO P/ INJETÁVEL"),
    (lambda f: f.base == "PO" and "INJ" in f.vias, "PÓ P/ SOLUÇÃO INJETÁVEL"),
    (lambda f: f.base == "SOLUCAO" and "DIL" in f.mods and "INJ" in f.vias, "SOLUÇÃO P/ DILUIÇÃO P/ INFUSÃO"),
    (lambda f: f.base == "SOLUCAO" and "INJ" in f.vias, "SOLUÇÃO INJETÁVEL"),
    (lambda f: f.base == "SUSPENSAO" and "INJ" in f.vias, "SUSPENSÃO INJETÁVEL"),
    (lambda f: f.base == "EMULSAO" and "INJ" in f.vias, "EMULSÃO INJETÁVEL"),
    (lambda f: f.base == "SOLUCAO" and "OFT" in f.vias, "SOLUÇÃO OFTÁLMICA"),
    (lambda f: f.base == "SOLUCAO" and "NASAL" in f.vias, "SOLUÇÃO NASAL"),
    (lambda f: f.base == "SOLUCAO" and "INAL" in f.vias, "SOLUÇÃO P/ INALAÇÃO"),
    (lambda f: f.base == "SOLUCAO" and "GOTAS" in f.mods, "SOLUÇÃO ORAL - GOTAS"),
    (lambda f: f.base == "SOLUCAO", "SOLUÇÃO ORAL"),
    (lambda f: f.base == "PO" and f.para == "SUSPENSAO", "PÓ P/ SUSPENSÃO ORAL"),
    (lambda f: f.base == "SUSPENSAO", "SUSPENSÃO ORAL"),
    (lambda f: f.base == "XAROPE", "XAROPE"),
    (lambda f: f.base == "CREME", "CREME"),
    (lambda f: f.base == "POMADA", "POMADA"),
    (lambda f: f.base == "GEL", "GEL"),
    (lambda f: f.base == "ADESIVO", "ADESIVO TRANSDÉRMICO"),
    (lambda f: f.base == "GRANULADO", "GRANULADO"),
]


def _forma_catalogo(f) -> str:
    for cond, txt in FORMA_CAT:
        try:
            if cond(f):
                return txt
        except Exception:  # noqa: BLE001
            continue
    return f.resumo()


def _nome_pdm(ing_original: str) -> str:
    """Nome do PDM com acento, sem o sal escrito na frente ("CLORIDRATO DE X" -> "X")."""
    s = re.sub(r"\s+", " ", ing_original.strip().upper())
    base = nome_base(s)
    palavras = s.split(" ")
    # devolve a mesma quantidade final de palavras do nome-base, preservando acentos do original
    n = len(base.split(" "))
    return " ".join(palavras[-n:]) if n <= len(palavras) else s


def rascunho(r: Registro, modelo: str | None = None) -> str:
    ings = [x for x in str(r.substancia).split(";") if x.strip()]
    pdm = _nome_pdm(ings[0]) if ings else "?"
    partes = [pdm]
    if len(ings) > 1:
        outros = [_nome_pdm(x) for x in ings[1:]]
        partes.append("COMPOSIÇÃO: ASSOCIADO A " + " E ".join(outros))
    if r.ap.doses:
        partes.append("CONCENTRAÇÃO: " + " + ".join(re.sub(r"\s+", " ", d.texto) for d in r.ap.doses))
    partes.append("FORMA FARMACÊUTICA: " + _forma_catalogo(r.ap.forma))
    ad = []
    if "SER" in r.acessorios or (r.ap.primario and r.ap.primario.tipo == "SERINGA"):
        ad.append("SERINGA PREENCHIDA")
    if "CAN" in r.acessorios:
        ad.append("COM CANETA APLICADORA")
    if "SIST FECH" in r.acessorios:
        ad.append("SISTEMA FECHADO")
    if "DIL" in r.acessorios:
        ad.append("+ DILUENTE")
    if ad:
        partes.append("CARACTERÍSTICAS ADICIONAIS: " + ", ".join(ad))
    txt = ", ".join(partes)
    return txt + (f"   [modelo de redação: {modelo}]" if modelo else "")


def modelo_de_redacao(ctx: Contexto, r: Registro) -> str | None:
    """Item ativo mais recente com a mesma forma (para imitar o padrao do catalogo)."""
    alvo = _forma_catalogo(r.ap.forma)
    rx = re.compile(r"FORMA FARMAC[EÊ]UTICA:\s*" + re.escape(alvo) + r"\s*(?:,|$)")
    melhor = None
    for c in sorted(ctx.cat.itens, reverse=True):
        it = ctx.cat.itens[c]
        if it.ativo and not it.flags and it.descricao_extracao is None and rx.search(it.descricao.upper()):
            melhor = it
            break
    return f"{melhor.codigo} {melhor.descricao.strip()}" if melhor else None


# ---------------------------------------------------------------------------

def fornecimento(ctx: Contexto, p: Proposta) -> None:
    if not p.catmat or p.nivel == "Fora":
        return
    it = ctx.cat.get(p.catmat)
    if it is None:
        return
    ex, comp = unidades_compativeis(p.registro, it)
    un, motivo = escolher_unidade(comp, ex, ctx.P.catmat_un.get(p.catmat), p.registro.ap)
    p.unidade = un
    if un is None:
        p.alerta("unidade: " + motivo)
        if p.nivel == "A":
            p.nivel = "B"
            p.evidencia = "sem unidade oficial compatível; " + p.evidencia
        return
    if motivo != "recipiente e conteúdo iguais":
        p.alerta("unidade: " + motivo)
    p.qt = qt_embalagem(p.registro.ap, un)
    a = qt_alerta(p.qt, [])
    if re.search(r"\b(?:PVC|PVDC|PE|PCTFE|ACLAR|PP)(?:/[A-Z]+)*\s+\d{2,3}\s+(?:TRANS|OPC|INC|AMB|BRANCO)", p.registro.ap.texto):
        a = (a + "; " if a else "") + "gramatura do blister presente na apresentação: Qt lido de 'X n'"
    if a:
        p.qt_alerta = a
        p.alerta(a)


def _opcoes_de_candidatos(cands: list, n: int = 3) -> list[Opcao]:
    return [Opcao(c.item.codigo, 0, 0, c.av.grau if c.av.aprovado else "essencial",
                  "; ".join(c.av.notas)[:200] if c.av.aprovado else "; ".join(c.av.essenciais)[:200]) for c in cands[:n]]


def processar(ctx: Contexto, r: Registro) -> Proposta:
    cat, P = ctx.cat, ctx.P
    if r.teste:
        p = Proposta(r, "Fora", metodo="R12", evidencia="produto de teste da ANVISA (R12)", regras=["R12"])
        return p
    dec = ctx.decisoes.get(r.registro)
    prec = ctx.idx.consultar(r)
    pp = PREC.decidir(r, prec, cat, P)
    if pp is not None and pp.nivel == "A" and dec is None:
        fornecimento(ctx, pp)
        return pp
    cands, procurado = CAND.gerar(r, cat, P)
    aprovados = [c for c in cands if c.av.aprovado and c.item.ativo]
    if dec is not None:
        return _de_decisao(ctx, r, dec, cands, procurado, pp)
    if pp is not None:
        # B pelo precedente: mantem as opcoes da GP e junta o melhor candidato ativo (R14)
        p = pp
        p.candidatos = cands
        top_ok = p.avaliacao is not None and p.avaliacao.aprovado and cat.get(p.catmat) and cat.get(p.catmat).ativo
        if not top_ok and aprovados:
            subst = aprovados[0]
            p.opcoes.append(Opcao(subst.item.codigo, 0, 0, subst.av.grau, "substituto ativo (R14)"))
            p.catmat = subst.item.codigo
            p.aderencia = subst.av.grau
            p.alerta("precedente reprovado/inativo; proposto o substituto ativo pela R14")
        elif not top_ok and cat.get(p.catmat) is not None and not cat.get(p.catmat).ativo:
            # inativo nunca vira proposta (secao 8, item 2): fica so como opcao, com o motivo
            for o in p.opcoes:
                if o.catmat == p.catmat:
                    o.motivo = "CATMAT do precedente, hoje inativo"
            p.alerta(f"precedente aponta para o CATMAT {p.catmat}, inativo, e nenhum item ativo passa nas guardas "
                     "(substituto a pedir: ver nível D/rascunho)")
            p.catmat = None
            p.aderencia = ""
            p.rascunho = rascunho(r, modelo_de_redacao(ctx, r))
        fornecimento(ctx, p)
        return p
    nt = evidencia_nao_tem(ctx, r)
    if aprovados:
        c = aprovados[0]
        p = Proposta(r, "C", precedente=nt, catmat=c.item.codigo, metodo="catálogo", aderencia=c.av.grau, avaliacao=c.av,
                     candidatos=cands, busca=procurado, opcoes=_opcoes_de_candidatos(aprovados),
                     evidencia="sugestão do ranqueador (R10/R14); aguardando adjudicação", regras=["R10", "R14"])
        p.alerta("pendente de adjudicação")
        for n in c.av.notas:
            p.alerta(n)
        fornecimento(ctx, p)
        return p
    p = Proposta(r, "D", metodo="catálogo", candidatos=cands, busca=procurado, precedente=nt,
                 evidencia="nenhum item ativo passa sem trocar atributo essencial (R14); aguardando adjudicação",
                 regras=["R11", "R14"])
    p.opcoes = _opcoes_de_candidatos([c for c in cands if c.item.ativo])
    p.rascunho = rascunho(r, modelo_de_redacao(ctx, r))
    p.alerta("pendente de adjudicação")
    return p


def _de_decisao(ctx: Contexto, r: Registro, dec: Decisao, cands, procurado, pp) -> Proposta:
    cat, P = ctx.cat, ctx.P
    regras = [x.strip() for x in re.split(r"[,;]", dec.regras) if x.strip()]
    if dec.decisao == "CATMAT" and dec.catmats:
        it = cat.get(dec.catmats[0])
        av = avaliar(r, it, P, cat) if it else None
        p = Proposta(r, "C", catmat=dec.catmats[0], metodo="adjudicação", avaliacao=av, candidatos=cands,
                     busca=procurado, evidencia=dec.justificativa, regras=regras or ["R10", "R14"])
        p.precedente = pp.precedente if pp else ""
        if it is None or av is None or not av.aprovado or not it.ativo:
            p.nivel = "B"
            p.alerta("decisão do agente reprovada nas guardas: " + (av.resumo() if av else "código fora do catálogo"))
        p.aderencia = av.grau if av and av.aprovado else ""
        for n in (av.notas if av else []):
            if av.grau == "aproximado":
                p.alerta(n)
        if av and av.grau == "aproximado":
            p.alerta("aproximado (R14 grau 2): " + "; ".join(av.notas)[:300])
        fornecimento(ctx, p)
        return p
    if dec.decisao in ("NAO_TEM", "NÃO_TEM", "NAO TEM"):
        p = Proposta(r, "D", metodo="adjudicação", candidatos=cands, busca=procurado, evidencia=dec.justificativa,
                     regras=regras or ["R11", "R14"])
        p.opcoes = _opcoes_de_candidatos([c for c in cands if c.item.ativo])
        p.rascunho = rascunho(r, modelo_de_redacao(ctx, r))
        return p
    p = Proposta(r, "B", metodo="adjudicação", candidatos=cands, busca=procurado, evidencia=dec.justificativa,
                 regras=regras)
    p.opcoes = [Opcao(c, 0, 0, "", "opção do agente" + ("" if cat.no_csv(c) else " (só na extração de unidades, fora do CSV 11/07)"))
                for c in dec.catmats]
    no_csv = [c for c in dec.catmats if cat.no_csv(c)]
    p.catmat = no_csv[0] if no_csv else None  # codigo fora do CSV nunca vira "Proposta CATMAT" (secao 8, item 2)
    p.alerta("agente não achou escolha inequívoca: " + " | ".join(str(c) for c in dec.catmats))
    fornecimento(ctx, p)
    return p


# ---------------------------------------------------------------------------

def revisar_nao_tem(ctx: Contexto, r: Registro) -> dict:
    prec = ctx.idx.consultar(r)
    conflito = prec.metodo in ("irmão", "gêmeo", "gêmeo+volume") and prec.unanime
    cands, procurado = CAND.gerar(r, ctx.cat, ctx.P, so_ativos=True)
    aprov = [c for c in cands if c.av.aprovado and c.item.ativo and not (set(c.item.flags) - {"nome"})]
    melhor = aprov[0] if aprov else None
    return {"conflito": conflito, "precedente": prec.resumo() if prec.metodo != "nenhum" else "",
            "precedente_top": prec.top if conflito else None, "melhor": melhor, "outros": aprov[1:3],
            "candidatos": cands, "busca": procurado}


def suspeitas(ctx: Contexto) -> list[tuple[Registro, int, object]]:
    out = []
    for r, c in ctx.links:
        if r.gp.status != "num":
            continue
        it = ctx.cat.get(c)
        if it is None:
            out.append((r, c, None))
            continue
        av = avaliar(r, it, ctx.P, ctx.cat)
        if not av.aprovado:
            out.append((r, c, av))
    return out


def descricao_proposta(cat: Catalogo, c: int | None) -> str | None:
    if not c:
        return None
    it = cat.get(c)
    if it is None:
        return None
    return sem_rotulos(it.descricao)
