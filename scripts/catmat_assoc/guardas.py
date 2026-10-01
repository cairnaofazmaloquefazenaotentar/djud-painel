"""
Guardas G1-G7 (secao 5.4) e grau de aderencia da escada R14.

Cada guarda devolve ok=True (aprovada), ok=False (reprovada, com motivo) ou ok=None
(nao verificavel: o CATMAT nao diz, ou o parse nao conseguiu ler). Para o nivel A
todas tem de ser True ou None, e G1 tem de ser True.

Grau (R14):
  exato        todos os atributos casam literalmente
  equivalente  so difere na forma de escrever (sal x base, por mL x total, forma dada
               pela unidade de fornecimento, "revestido", material do recipiente)
  aproximado   difere num atributo NAO essencial (liberacao sem item proprio, acessorio
               nao citado, creme x pomada, solucao x xarope oral)
  essencial    contraria principio ativo, dose, via, comprimido x capsula, associacao x
               monodroga, liberacao/modificador citado pelo CATMAT e ausente no registro
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field

from .catalogo import Item
from .normaliza import Dose, Forma, iguais, leituras, limpar, nome_base
from .pontes import Pontes, classe_nivel, eh_categoria
from .registro import Registro

GRAUS = ("exato", "equivalente", "aproximado", "essencial")


@dataclass
class Guarda:
    codigo: str
    ok: bool | None
    motivo: str = ""

    def __str__(self) -> str:
        s = {True: "ok", False: "REPROVADA", None: "n/v"}[self.ok]
        return f"{self.codigo} {s}" + (f" ({self.motivo})" if self.motivo else "")


@dataclass
class Avaliacao:
    codigo: int
    guardas: list[Guarda]
    grau: str = "exato"
    notas: list[str] = field(default_factory=list)  # equivalencias e aproximacoes aplicadas
    essenciais: list[str] = field(default_factory=list)  # atributos essenciais contrariados
    unidades: list = field(default_factory=list)  # unidades oficiais compativeis
    pontos: float = 0.0

    @property
    def aprovado(self) -> bool:
        """Nenhuma guarda reprovada, exceto G6 (classe terapeutica so gera alerta e impede o nivel A)."""
        return all(g.ok is not False for g in self.guardas if g.codigo != "G6")

    @property
    def aprovado_a(self) -> bool:
        return all(g.ok is not False for g in self.guardas)

    def guarda(self, cod: str) -> Guarda:
        return next(g for g in self.guardas if g.codigo == cod)

    def reprovadas(self) -> list[Guarda]:
        return [g for g in self.guardas if g.ok is False]

    def resumo(self) -> str:
        return "; ".join(str(g) for g in self.guardas)

    def piora(self, grau: str, nota: str) -> None:
        if GRAUS.index(grau) > GRAUS.index(self.grau):
            self.grau = grau
        if nota and nota not in self.notas:
            self.notas.append(nota)


# ---------------------------------------------------------------------------
# G2 ingredientes

PALAVRAS_GENERICAS = {
    "VACINA", "ATENUADA", "INATIVADA", "RECOMBINANTE", "ADSORVIDA", "CONJUGADA", "HUMANA", "GRUPO", "TIPO", "SOROTIPO",
    "PROTEINA", "CARREADORA", "ACIDO", "EXTRATO", "SECO", "FLUIDO", "OLEO", "SOLUCAO", "CLORETO", "SULFATO",
    "FOSFATO", "ACETATO", "CITRATO", "CARBONATO", "BICARBONATO", "GLICOSE", "SODIO", "POTASSIO", "CALCIO",
    "MAGNESIO", "HIDRATADO", "MONOIDRATADO", "MICRONIZADO", "FATOR", "COAGULACAO", "ALFA", "BETA", "INSULINA",
    "MENINGOCOCICO", "OLIGOSSACARIDEO",
}


def _rx_nome(n: str) -> re.Pattern:
    return re.compile(r"(?<![A-Z0-9])" + re.escape(n) + r"(?![A-Z0-9])")


def radical(nome: str) -> str | None:
    """Palavra mais longa, sem a vogal final (NUSINERSENA -> NUSINERSEN). Minimo 5 letras."""
    pal = [w for w in re.findall(r"[A-Z]{5,}", limpar(nome)) if w not in PALAVRAS_GENERICAS]
    if not pal:
        return None
    w = max(pal, key=len)
    w = re.sub(r"[AEIO]$", "", w)
    return w if len(w) >= 5 else None


def _palavras_distintivas(t: str) -> list[str]:
    return [w for w in re.findall(r"[A-Z]{5,}", limpar(t)) if w not in PALAVRAS_GENERICAS and w not in (
        "CONTRA", "VENENO", "TOXINA", "HETEROLOGA", "HETEOLOGA", "IMUNOGLOBULINA", "BIVALENTE", "TRIVALENTE",
        "TETRAVALENTE", "SOROTIPO", "CAPSULAR", "POLISSACARIDEO", "CONJUGADO", "PURIFICADA", "FRACIONADA")]


def casa_categoria(ing: str, it: Item) -> bool:
    """PDM de categoria (VACINA, SORO, AMINOACIDOS...): metade das palavras distintivas do ingrediente
    (pelo prefixo de 5 letras) tem de estar no texto do item; aminoacidos pela sigla."""
    from .pontes import SIGLA_AMINOACIDO
    b = nome_base(ing)
    for nome, sig in SIGLA_AMINOACIDO.items():
        if b == nome or b.endswith(" " + nome) or b == "LEVO" + nome.lower().upper() or b.replace("LEVO", "") == nome \
                or b.replace("L-", "") == nome:
            return bool(re.search(r"(?<![A-Z])" + sig + r"(?![A-Z])", it.texto)) or nome in it.texto
    ws = _palavras_distintivas(ing)
    if not ws:
        return False
    achou = sum(1 for w in ws if re.search(r"(?<![A-Z])" + re.escape(w[:5]), it.resto))
    return achou >= max(1, (len(ws) + 1) // 2)


def achar_ingrediente(ing: str, it: Item, P: Pontes) -> str | None:
    """Como o ingrediente aparece no CATMAT: 'pdm' (ponte), 'texto', 'radical' ou None."""
    nomes = P.nomes(ing)
    for n in sorted(nomes, key=len, reverse=True):
        if it.pdm == n:
            if eh_categoria(n):
                # PDM de categoria: precisa das palavras distintivas do ingrediente no texto
                if casa_categoria(ing, it) or P.ing_catmats.get(limpar(ing), {}).get(it.codigo):
                    return "pdm"
                continue
            return "pdm"
    if eh_categoria(it.pdm) and casa_categoria(ing, it):
        return "texto"
    for n in sorted(nomes, key=len, reverse=True):
        if len(n) >= 4 and not eh_categoria(n) and _rx_nome(n).search(it.texto):
            return "texto"
    r = radical(nome_base(ing))
    if r and re.search(r"(?<![A-Z])" + re.escape(r), it.texto):
        return "radical"
    # grafia parecida do PDM (GONADOTROFINA x GONADOTROPINA) ou nome contido (BETADINUTUXIMABE ⊃ DINUTUXIMABE)
    import difflib
    b = nome_base(ing)
    pb = nome_base(it.pdm)
    if len(b) >= 6 and len(pb) >= 6 and (difflib.SequenceMatcher(None, b, pb).ratio() >= 0.82 or
                                          (len(pb) >= 8 and pb in b) or (len(b) >= 8 and b in pb)):
        return "radical"
    # palavra distintiva longa do ingrediente ("COPOLIMERO ... METACRILATO DE NICOTINA" -> NICOTINA)
    for w in re.findall(r"[A-Z]{6,}", b):
        if w not in PALAVRAS_GENERICAS and w not in ("COPOLIMERO", "METACRILATO", "POLIMERO", "COMPLEXO", "RESINA",
                                                     "CONJUGADO", "CONJUGADA", "PROTEINA", "POLISSACARIDEO") \
                and re.search(r"(?<![A-Z])" + re.escape(w[:-1]), it.pdm):
            return "radical"
    return None


def n_componentes_registro(r: Registro) -> int:
    """Componentes distintos: ingredientes com o mesmo nome-base contam uma vez, salvo quando
    a apresentacao traz uma dose para cada (betametasona fosfato + acetato)."""
    n_bases = len(set(r.bases)) or 1
    nd = len(r.ap.doses)
    if r.ap.kit:
        return n_bases
    if not r.ap.kit and "+" in r.ap.prefixo and nd >= 2:
        return nd
    return n_bases


FAMILIA_SAL = [
    ("SODIO", r"SODI(?:CO|CA|O)|DISSODIC[OA]|SAL SODICO"), ("POTASSIO", r"POTASSI(?:CO|CA|O)"),
    ("CALCIO", r"CALCI(?:CO|CA)"), ("MAGNESIO", r"MAGNESI(?:CO|CA)|MAGNESIO"), ("DIETILAMONIO", r"DIETILAMONIO"),
    ("COLESTIRAMINA", r"COLESTIRAMINA"), ("CLORIDRATO", r"CLORIDRATO|HIDROCLORETO"), ("BROMIDRATO", r"BROMIDRATO"),
    ("SULFATO", r"(?<!BIS)SULFATO"), ("BISSULFATO", r"BISSULFATO"), ("MALEATO", r"MALEATO"), ("FUMARATO", r"FUMARATO"),
    ("SUCCINATO", r"SUCCINATO"), ("TARTARATO", r"TARTARATO"), ("MESILATO", r"MESILATO"), ("BESILATO", r"BESILATO"),
    ("TOSILATO", r"TOSILATO"), ("CITRATO", r"CITRATO"), ("FOSFATO", r"FOSFATO"),
    ("DIPROPIONATO", r"DIPROPIONATO"), ("PROPIONATO", r"(?<!DI)PROPIONATO"), ("VALERATO", r"VALERATO"),
    ("ACETATO", r"ACETATO"), ("FUROATO", r"FUROATO"), ("DECANOATO", r"DECANOATO"), ("CIPIONATO", r"CIPIONATO"),
    ("ENANTATO", r"ENANTATO"), ("PALMITATO", r"PALMITATO"), ("BENZATINA", r"BENZATINA"), ("PROCAINA", r"PROCAINA"),
]


def sais_no_texto(t: str) -> set[str]:
    return {f for f, rx in FAMILIA_SAL if re.search(r"(?<![A-Z])(?:" + rx + r")(?![A-Z])", t)}


def conflito_de_sal(r: Registro, it: Item) -> str | None:
    """R2: sal/ester diferente (sodico x potassico, dipropionato x valerato) muda o produto.
    So para monodroga, e so quando os dois lados escrevem o sal."""
    if len(set(r.bases)) != 1:
        return None
    ing = limpar(r.ingredientes[0])
    sr = sais_no_texto(ing.replace(nome_base(ing), " "))
    sc = sais_no_texto(it.texto.replace(nome_base(it.pdm), " ", 1)) if it.pdm else set()
    if not sr or not sc or sr & sc:
        return None
    return f"sal/éster: registro {'/'.join(sorted(sr))}, CATMAT {'/'.join(sorted(sc))}"


CATEGORIAS_COMPOSICAO = ("VACINA", "SORO", "LISADO BACTERIANO", "IMUNOGLOBULINA")


def componente_a_mais(r: Registro, it: Item) -> str | None:
    """R8: vacina/soro com componente que o registro nao tem (DTP + HepB + Polio x DTP + Hib) e outro produto."""
    if not any(it.pdm.startswith(c) for c in CATEGORIAS_COMPOSICAO):
        return None
    reg = limpar(" ".join([r.substancia, r.produto, r.apresentacao]))
    comp = " ".join(v for rot, v in it.atributos if re.search(r"COMPOS|COMPONENTE|TIPO", rot))
    falta = []
    for w in re.findall(r"[A-Z]{3,}", comp):
        if len(w) < 5 and w not in ("BCG", "HPV", "DTP", "HIB", "VIP", "VOP", "MMR", "HEPA", "HEPB"):
            continue
        if w in PALAVRAS_GENERICAS or w in ("INATIVADA", "ATENUADA", "CONJUGADA", "ADSORVIDA", "RECOMBINANTE", "PURIFICADA",
                                            "TETRAVALENTE", "TRIVALENTE", "BIVALENTE", "VALENTE", "CULTIVADO", "CELULAS",
                                            "EMBRIAO", "GALINHA", "SINTETICO", "ACELULAR", "CELULAR", "OUTROS", "HUMANA",
                                            "EQUINA", "HETEROLOGO", "HETEROLOGA", "ANTI", "SOROS", "FRAGMENTO"):
            continue
        if not re.search(r"(?<![A-Z])" + re.escape(w[:5]), reg):
            falta.append(w)
    if not falta:
        return None
    if len(falta) >= 1 and len(set(falta)) >= max(1, len(set(re.findall(r"[A-Z]{5,}", comp))) // 3):
        return "componente do CATMAT ausente no registro: " + ", ".join(sorted(set(falta))[:5])
    return None


def g2_ingredientes(r: Registro, it: Item, P: Pontes, av: Avaliacao) -> Guarda:
    ings = list(r.ingredientes)
    if not ings:
        return Guarda("G2", None, "registro sem substância")
    # ponte de conjunto: so vale para PDM de categoria ou para o proprio CATMAT ja usado pela GP para o
    # conjunto (senao "PARACETAMOL + PSEUDOEFEDRINA" aceitaria qualquer item com PDM PARACETAMOL)
    conj = P.conj_pdm.get(frozenset(ings))
    via_conj = bool(conj and conj.get(it.pdm) and P.conj_catmats.get(frozenset(ings), {}).get(it.codigo))
    achados = {i: achar_ingrediente(i, it, P) for i in ings}
    faltam = [i for i, a in achados.items() if a is None]
    n_reg = n_componentes_registro(r)
    n_cat = it.n_componentes
    categoria = eh_categoria(it.pdm)
    if n_cat is not None and not categoria and (n_reg == 1) != (n_cat == 1):
        av.essenciais.append(f"associação × monodroga: registro {n_reg}, CATMAT {n_cat}")
        return Guarda("G2", False, f"associação × monodroga (registro {n_reg}, CATMAT {n_cat})")
    if faltam and not via_conj:
        # mesmo nome-base de outro ingrediente ja achado (AZITROMICINA;AZITROMICINA DI-HIDRATADA)
        achadas_bases = {nome_base(i) for i, a in achados.items() if a}
        faltam = [i for i in faltam if nome_base(i) not in achadas_bases]
    if faltam and not via_conj:
        av.essenciais.append("princípio ativo: " + ", ".join(faltam))
        return Guarda("G2", False, "ausente no CATMAT: " + ", ".join(faltam))
    if faltam and via_conj:
        av.piora("equivalente", "ingredientes pela ponte de conjunto aprendida da GP")
    if any(a == "radical" for a in achados.values()):
        av.piora("aproximado", "nome casado só pelo radical: " + ", ".join(i for i, a in achados.items() if a == "radical"))
    extra = componente_a_mais(r, it)
    if extra:
        av.essenciais.append(extra)
        return Guarda("G2", False, extra)
    sal = conflito_de_sal(r, it)
    if sal:
        av.essenciais.append(sal)
        return Guarda("G2", False, sal)
    if n_cat is not None and not categoria and n_reg != n_cat:
        return Guarda("G2", None, f"nº de componentes registro {n_reg} × CATMAT {n_cat}")
    if r.substancia_incompleta:
        av.piora("equivalente", "SUBSTÂNCIA incompleta; componentes contados pela APRESENTAÇÃO")
    return Guarda("G2", True)


# ---------------------------------------------------------------------------
# G3 dose


def _casa(lr: set, lc: set) -> bool:
    return any(a[0] == b[0] and iguais(a[1], b[1]) for a in lr for b in lc)


def _emparelhar(reg: list[set], cat: list[set]) -> bool:
    if len(cat) > len(reg):
        return False
    if len(cat) > 7:
        usados: set[int] = set()
        for lc in cat:
            j = next((j for j, lr in enumerate(reg) if j not in usados and _casa(lr, lc)), None)
            if j is None:
                return False
            usados.add(j)
        return True
    for perm in itertools.permutations(range(len(reg)), len(cat)):
        if all(_casa(reg[p], cat[i]) for i, p in enumerate(perm)):
            return True
    return False


def g3_dose(r: Registro, it: Item, P: Pontes, av: Avaliacao) -> Guarda:
    if not it.doses:
        return Guarda("G3", None, "CATMAT sem dose")
    if not r.ap.doses:
        return Guarda("G3", None, "registro sem dose legível")
    reg = [leituras(d, r.ap) for d in r.ap.doses]
    # R6: kit com doses diferentes so casa com CATMAT de kit (todas as doses), nunca com o de uma dose
    doses_kit = {(d.unidade, round(d.valor, 4), d.den) for d in r.ap.doses}
    if r.ap.kit and len(set(r.bases)) == 1 and len(doses_kit) >= 2 and len(it.doses) < len(doses_kit):
        av.essenciais.append("kit com mais de uma dose × CATMAT de dose única (R6)")
        return Guarda("G3", False, "kit com doses diferentes × CATMAT de dose única (R6)")
    variantes = [it.doses] + ([it.doses_alt] if it.doses_alt != it.doses else []) + list(it.doses_equiv)
    for vi, ds in enumerate(variantes):
        cat = [leituras(d) for d in ds]
        if _emparelhar(reg, cat):
            if any(_so_total(r, d) for d in ds):
                av.piora("equivalente", "dose total por recipiente = concentração × volume (R3)")
            return Guarda("G3", True)
    # sal x base pela razao aprendida da GP (monodroga)
    if len(r.ingredientes) == 1 and len(it.doses) == 1 and len(r.ap.doses) >= 1 and (
            r.sais[0] or re.search(r"\b(?:SAL|COMPOSICAO|BASE|EQUIVALENTE)\b", it.texto)):
        raz = P.razao.get(r.ingredientes[0])
        if raz:
            q, n = raz.most_common(1)[0]
            if n >= 3 and 0.55 <= q <= 1.6 and q not in (0.5, 1.0, 2.0):
                lc = leituras(it.doses[0])
                for lr in reg:
                    if _casa({(a, b * q) for a, b in lr}, lc):
                        av.piora("equivalente", f"sal × base: razão {q:g} aprendida da GP ({n} vínculos) (R2)")
                        return Guarda("G3", True)
    # sal x base sem razao aprendida: dose do CATMAT 55-99% da do registro (ou 101-160% quando o CATMAT
    # escreve o sal). Nao aprova: fica "nao verificavel" para o adjudicador conferir a massa molar (R2).
    if len(set(r.bases)) == 1 and len(it.doses) == 1 and len(r.ap.doses) == 1 and (r.sais[0] or re.search(
            r"\b(?:SAL|COMPOSICAO)\b", it.texto)):
        lc = leituras(it.doses[0])
        for a, va in reg[0]:
            for b2, vb in lc:
                if a == b2 and va > 0 and 0.55 <= vb / va <= 1.6 and not 0.98 <= vb / va <= 1.02:
                    av.piora("aproximado", f"possível sal × base: CATMAT {vb:g} / registro {va:g} {a} (razão {vb / va:.3f}); "
                                           "conferir massa molar (R2)")
                    return Guarda("G3", None, f"possível sal × base (razão {vb / va:.3f}), conferir massa molar")
    # CATMAT liquido escrito sem denominador ("DESLORATADINA 1,25 MG, SOLUCAO ORAL-GOTAS")
    if len(it.doses) == len(r.ap.doses) and all(d.den is None for d in it.doses) and formas(it.forma) & {
            "SOLUCAO", "SUSPENSAO", "XAROPE", "EMULSAO", "GEL", "CREME", "POMADA", "ELIXIR"}:
        reg_c = [{(a.split("/")[0], b) for a, b in lr if "/" in a} for lr in reg]
        if _emparelhar(reg_c, [leituras(d) for d in it.doses]):
            av.piora("aproximado", "CATMAT escreve a concentração sem denominador")
            return Guarda("G3", True)
    av.essenciais.append("dose: CATMAT " + " + ".join(str(d) for d in it.doses) + " × registro " +
                         " + ".join(str(d) for d in r.ap.doses))
    return Guarda("G3", False, "dose diferente: CATMAT " + " + ".join(str(d) for d in it.doses))


def _so_total(r: Registro, d: Dose) -> bool:
    return d.den is None and any(x.den in ("ML", "G") for x in r.ap.doses)


# ---------------------------------------------------------------------------
# G4 forma

ESTADO = {
    "COMPRIMIDO": "SOLIDO", "CAPSULA": "SOLIDO", "PASTILHA": "SOLIDO", "GOMA": "SOLIDO", "FILME": "SOLIDO",
    "TABLETE": "SOLIDO",
    "SOLUCAO": "LIQUIDO", "SUSPENSAO": "LIQUIDO", "EMULSAO": "LIQUIDO", "XAROPE": "LIQUIDO", "ELIXIR": "LIQUIDO",
    "COLUTORIO": "LIQUIDO", "TINTURA": "LIQUIDO", "OLEO": "LIQUIDO", "AEROSSOL": "LIQUIDO", "SPRAY": "LIQUIDO",
    "LOCAO": "LIQUIDO",
    "PO": "PO", "GRANULADO": "PO",
    "CREME": "SEMI", "POMADA": "SEMI", "GEL": "SEMI", "PASTA": "SEMI", "ESPUMA": "SEMI",
}
# pares (registro, CATMAT) que sao so forma de escrever
EQUIVALENTES = {
    frozenset({"AEROSSOL", "SPRAY"}), frozenset({"PASTILHA", "COMPRIMIDO"}),
}
# pares aceitos como aproximacao (grau 2), com precedente na GP
APROXIMADOS = {
    frozenset({"CREME", "POMADA"}), frozenset({"CREME", "GEL"}), frozenset({"GEL", "POMADA"}),
    frozenset({"SOLUCAO", "XAROPE"}), frozenset({"SOLUCAO", "SUSPENSAO"}), frozenset({"SOLUCAO", "ELIXIR"}),
    frozenset({"XAROPE", "SUSPENSAO"}), frozenset({"SOLUCAO", "EMULSAO"}), frozenset({"PO", "GRANULADO"}),
    frozenset({"SOLUCAO", "LOCAO"}), frozenset({"CREME", "LOCAO"}), frozenset({"SOLUCAO", "AEROSSOL"}),
    frozenset({"SOLUCAO", "SPRAY"}), frozenset({"SUSPENSAO", "SPRAY"}), frozenset({"SUSPENSAO", "AEROSSOL"}),
    frozenset({"SOLUCAO", "GEL"}), frozenset({"SUSPENSAO", "EMULSAO"}),
}
MODS_DIFERENCIAM = ("ORODISP", "SUBL", "MAST", "EFEV", "DISP")


def formas(f: Forma) -> set[str]:
    """Bases aceitas para comparar: PO P/ SUSPENSAO oral vale como PO e como SUSPENSAO."""
    out = {f.base} if f.base else set()
    if f.para and f.base in ("PO", "GRANULADO", "COMPRIMIDO") and "INJ" not in f.vias:
        out.add(f.para)
    return out


def _irmao_existe(ctx, it: Item, pred) -> bool:
    """Ha no catalogo item ativo do mesmo PDM, com as mesmas doses, que satisfaz pred?"""
    if ctx is None:
        return False
    for c in ctx.por_pdm.get(it.pdm, ()):
        j = ctx.itens[c]
        if c == it.codigo or not j.ativo or (set(j.flags) - {"nome"}):
            continue
        if [leituras(d) for d in j.doses] and len(j.doses) == len(it.doses) and all(
                _casa(leituras(a), leituras(b)) for a, b in zip(j.doses, it.doses)) and pred(j):
            return True
    return False


def g4_forma(r: Registro, it: Item, P: Pontes, av: Avaliacao, ctx=None) -> Guarda:
    rf, cf = r.ap.forma, it.forma
    fr, fc = rf.familia, it.familia
    if fr != "?" and fc != "?" and fr != fc:
        par = {fr, fc}
        if par == {"IMPLANTE", "INJ"}:
            av.piora("equivalente", "implante injetável")
        elif par <= {"ORAL", "TOP"} and ("BUCAL" in rf.mods | cf.mods):
            av.piora("aproximado", "via oral × tópica bucal")
        else:
            av.essenciais.append(f"via: registro {fr}, CATMAT {fc}")
            return Guarda("G4", False, f"via {fr} × {fc}")
    rs, cs = formas(rf), formas(cf)
    rb = rf.base
    if not cs:
        us = it.formas_pelas_unidades()
        if rb in ("COMPRIMIDO", "CAPSULA") and us and rb not in us:
            av.essenciais.append(f"forma: {rb} × unidade oficial {'/'.join(sorted(us))}")
            return Guarda("G4", False, f"{rb} × unidade oficial {'/'.join(sorted(us))}")
        if rb is not None:
            av.piora("equivalente", "forma não escrita no CATMAT" + ("; dada pela unidade de fornecimento" if us else ""))
    elif rs and not (rs & cs):
        pares = {frozenset({a, b}) for a in rs for b in cs}
        if any(p == frozenset({"COMPRIMIDO", "CAPSULA"}) for p in pares):
            av.essenciais.append("comprimido × cápsula")
            return Guarda("G4", False, "comprimido × cápsula")
        rb_, cb_ = sorted(rs)[0], sorted(cs)[0]
        if pares & EQUIVALENTES:
            av.piora("equivalente", f"{rb_} = {cb_}")
        elif pares & APROXIMADOS:
            av.piora("aproximado", f"forma {'/'.join(sorted(rs))} → {'/'.join(sorted(cs))}")
        elif "PO" in rs and "INJ" in rf.vias and cs & {"SOLUCAO", "SUSPENSAO", "EMULSAO"}:
            av.piora("aproximado", "pó para injetável → " + "/".join(sorted(cs)) + " injetável")
        elif "PO" in cs and "INJ" in cf.vias and rs & {"SOLUCAO", "SUSPENSAO"}:
            av.piora("aproximado", "solução injetável → pó para injetável")
        elif any(ESTADO.get(a) and ESTADO.get(a) == ESTADO.get(b) for a in rs for b in cs):
            av.piora("aproximado", f"forma {'/'.join(sorted(rs))} → {'/'.join(sorted(cs))}")
        else:
            av.essenciais.append(f"forma: {'/'.join(sorted(rs))} × {'/'.join(sorted(cs))}")
            return Guarda("G4", False, f"forma {'/'.join(sorted(rs))} × {'/'.join(sorted(cs))}")
    # liberacao (R4: diferencia quando houver CATMAT proprio)
    if cf.lib and not rf.lib:
        if _irmao_existe(ctx, it, lambda j: j.forma.lib is None):
            av.essenciais.append(f"liberação: CATMAT {cf.lib}, registro convencional")
            return Guarda("G4", False, f"CATMAT de liberação {cf.lib}, registro convencional (há item convencional)")
        av.piora("aproximado", f"CATMAT de liberação {cf.lib}; registro não escreve a liberação e não há item convencional")
    if rf.lib and cf.lib and rf.lib != cf.lib:
        av.piora("aproximado", f"liberação {rf.lib} → {cf.lib}")
    if rf.lib and not cf.lib:
        if _irmao_existe(ctx, it, lambda j: j.forma.lib is not None):
            return Guarda("G4", False, f"registro LIB {rf.lib}: há CATMAT próprio de liberação modificada")
        av.piora("aproximado", f"liberação {rf.lib} sem item próprio (CATMAT genérico)")
    for m in MODS_DIFERENCIAM:
        if m in cf.mods and m not in rf.mods:
            if m == "DISP" and "EFEV" in rf.mods:
                continue
            av.essenciais.append(f"{m} no CATMAT, ausente no registro")
            return Guarda("G4", False, f"CATMAT {m}, registro não")
        if m in rf.mods and m not in cf.mods:
            if _irmao_existe(ctx, it, lambda j, m=m: m in j.forma.mods):
                return Guarda("G4", False, f"registro {m}: há CATMAT próprio")
            av.piora("aproximado", f"{m} sem item próprio (CATMAT genérico)")
    if "GOTAS" in cf.mods and "GOTAS" not in rf.mods and rs & {"SOLUCAO", "SUSPENSAO"}:
        av.piora("aproximado", "CATMAT em gotas, registro sem gotejador escrito")
    return Guarda("G4", True)


# ---------------------------------------------------------------------------
# G5 acessorio

def _tem_acessorio(r: Registro, a: str) -> bool:
    ac = r.acessorios
    tipos = {x.tipo for x in r.ap.recipientes}
    txt = r.ap.texto
    if a == "SER":
        return "SER" in ac or "SERINGA" in tipos or "CAN" in ac
    if a == "CAN":
        return "CAN" in ac or "CANETA" in tipos or bool(re.search(r"\bCAN(?:ETA)?\b", txt))
    if a == "SIST FECH":
        return "SIST FECH" in ac or "BOLSA" in tipos
    if a == "DIL":
        return "DIL" in ac
    if a == "INAL":
        return "INAL" in ac or bool(re.search(r"\bINAL", txt))
    if a == "APLIC":
        return "APLIC" in ac or bool(re.search(r"\bAPLIC", txt))
    if a == "CALEND":
        return "CALEND" in ac or "CALEND" in txt
    if a == "CAR":
        return "CAR" in ac or "CARPULE" in tipos
    if a == "EQP":
        return "EQP" in ac
    return True


ACESSORIOS_DUROS = ("SER", "CAN", "SIST FECH", "INAL", "CAR", "EQP")  # DIL/APLIC/CALEND: a GP aplica de forma frouxa


def g5_acessorio(r: Registro, it: Item, P: Pontes, av: Avaliacao, ctx=None) -> Guarda:
    falta = [a for a in sorted(it.acessorios) if a in ACESSORIOS_DUROS and not _tem_acessorio(r, a)]
    if falta:
        return Guarda("G5", False, "CATMAT exige " + ", ".join(falta))
    frouxos = [a for a in sorted(it.acessorios) if a not in ACESSORIOS_DUROS and a != "CAMARAS" and not _tem_acessorio(r, a)]
    if frouxos:
        av.piora("aproximado", "CATMAT cita " + ", ".join(frouxos) + " não escrito no registro")
    extra = [a for a in ("DIL", "SIST FECH", "CAN", "INAL", "APLIC", "EQP") if a in r.acessorios and a not in it.acessorios]
    if "SER" in r.acessorios and r.ap.forma.familia == "INJ" and not it.acessorios & {"SER", "CAN"}:
        extra.append("SER")
    for a in extra:
        if a in ("SIST FECH", "SER", "CAN", "EQP") and _irmao_existe(ctx, it, lambda j, a=a: a in j.acessorios):
            return Guarda("G5", False, f"registro com {a}: há CATMAT próprio")
    if extra:
        av.piora("aproximado", "acessório do registro não citado no CATMAT: " + ", ".join(extra))
    return Guarda("G5", True)


# ---------------------------------------------------------------------------
# G6 classe terapeutica

def g6_classe(r: Registro, it: Item, P: Pontes, av: Avaliacao) -> Guarda:
    if not r.classe:
        return Guarda("G6", None, "sem classe terapêutica")
    obs = P.pdm_classe.get(it.pdm)
    if not obs or sum(v for k, v in obs.items() if len(k) == 1) < 3:
        return Guarda("G6", None, "PDM sem histórico de classe")
    c1 = classe_nivel(r.classe, 1)
    if obs.get(c1):
        return Guarda("G6", True)
    return Guarda("G6", False, f"classe {classe_nivel(r.classe, 2)} nunca vista para {it.pdm}")


# ---------------------------------------------------------------------------
# G7 unidade

NOMES_UNIDADE = {
    "BLISTER": {"COMPRIMIDO", "CAPSULA", "DRAGEA", "PASTILHA", "BLISTER", "UNIDADE", "SUPOSITORIO", "OVULO",
                "ADESIVO", "GOMA", "TABLETE", "CONJUNTO", "KIT", "EMBALAGEM", "STRIP", "FILME"},
    "STRIP": {"COMPRIMIDO", "CAPSULA", "DRAGEA", "STRIP", "PASTILHA", "UNIDADE", "EMBALAGEM", "BLISTER", "DOSE"},
    "FRASCO": {"FRASCO", "FLACONETE", "FRASCO-AMPOLA", "FRASCO GOTEJADOR", "FRASCO SPRAY", "FRASCO NEBULIZADOR",
               "COMPRIMIDO", "CAPSULA", "DRAGEA", "POTE", "BOLSA", "TUBO", "UNIDADE", "DOSE", "ENVELOPE",
               "FRASCO APLICADOR", "FRASCO DOSADOR", "SACHE", "BISNAGA", "GALAO", "CARTUCHO", "EMBALAGEM", "AMPOLA"},
    "FRASCO-AMPOLA": {"FRASCO-AMPOLA", "FRASCO", "AMPOLA", "UNIDADE", "DOSE", "CONJUNTO", "KIT", "SERINGA",
                      "BOLSA", "EMBALAGEM"},
    "AMPOLA": {"AMPOLA", "FRASCO-AMPOLA", "FRASCO", "UNIDADE", "FLACONETE", "SERINGA", "TUBETE", "BOLSA",
               "CONJUNTO", "KIT", "DOSE", "EMBALAGEM"},
    "SERINGA": {"SERINGA", "CANETA", "UNIDADE", "DOSE", "FRASCO-AMPOLA", "CARPULE", "TUBETE", "CONJUNTO",
                "KIT", "AMPOLA", "EMBALAGEM", "CARTUCHO"},
    "CANETA": {"CANETA", "SERINGA", "CARPULE", "UNIDADE", "TUBETE", "CARTUCHO", "FRASCO-AMPOLA", "EMBALAGEM"},
    "BISNAGA": {"BISNAGA", "TUBO", "FRASCO", "POTE", "UNIDADE", "EMBALAGEM", "BISNAGA C/ APLICADOR", "SERINGA",
                "APLICADOR"},
    "BOLSA": {"BOLSA", "FRASCO", "FRASCO-AMPOLA", "SISTEMA FECHADO", "UNIDADE", "EMBALAGEM", "CONJUNTO", "KIT",
              "GALAO"},
    "ENVELOPE": {"ENVELOPE", "SACHE", "COMPRIMIDO", "CAPSULA", "UNIDADE", "PASTILHA", "DOSE", "EMBALAGEM",
                 "ADESIVO", "FLACONETE"},
    "SACHE": {"SACHE", "ENVELOPE", "UNIDADE", "DOSE", "EMBALAGEM", "FLACONETE"},
    "POTE": {"POTE", "FRASCO", "COMPRIMIDO", "CAPSULA", "LATA", "UNIDADE", "EMBALAGEM", "BISNAGA"},
    "GALAO": {"GALAO", "BOMBONA", "FRASCO", "BOLSA", "UNIDADE", "EMBALAGEM", "LITRO"},
    "CARPULE": {"TUBETE", "CARPULE", "CARTUCHO", "AMPOLA", "SERINGA", "CANETA", "FRASCO-AMPOLA", "UNIDADE", "REFIL",
                "FRASCO"},
    "FLACONETE": {"FLACONETE", "FRASCO", "AMPOLA", "UNIDADE", "DOSE", "FRASCO-AMPOLA"},
    "KIT": {"KIT", "CONJUNTO", "EMBALAGEM", "UNIDADE", "FRASCO-AMPOLA", "FRASCO", "SERINGA"},
    "CILINDRO": {"CILINDRO", "UNIDADE", "METRO CUBICO", "LITRO", "QUILOGRAMA"},
    "APLICADOR": {"APLICADOR", "UNIDADE", "SERINGA", "BISNAGA"},
    "TUBETE": {"TUBETE", "CARPULE", "AMPOLA"},
}
SOLIDOS_UN = {"COMPRIMIDO", "CAPSULA", "DRAGEA", "PASTILHA", "SUPOSITORIO", "OVULO", "ADESIVO", "GOMA", "TABLETE",
              "UNIDADE", "BLISTER", "CONJUNTO", "KIT", "EMBALAGEM", "STRIP", "FILME", "APLICADOR", "IMPLANTE",
              "DISPOSITIVO", "ANEL", "EMPLASTRO", "SISTEMA", "DOSE", "ENVELOPE", "SACHE"}


def un_nome(u) -> str:
    return limpar(u.unidade)


def unidades_compativeis(r: Registro, it: Item) -> tuple[list, list]:
    """(exatas, compativeis): exatas = mesmo tipo de recipiente E mesmo conteudo."""
    if not it.unidades:
        return [], []
    p = r.ap.primario
    tipo = p.tipo if p else None
    base = r.ap.forma.base
    vol, vun = r.ap.volume, r.ap.volume_un
    exatas, comp = [], []
    for u in it.unidades:
        nome = un_nome(u)
        if nome in ("NA", ""):
            continue
        ok_nome = False
        if base in ("COMPRIMIDO", "CAPSULA", "PASTILHA", "SUPOSITORIO", "OVULO", "ADESIVO", "GOMA", "IMPLANTE", "ANEL",
                    "DIU", "TABLETE", "FILME") and nome in SOLIDOS_UN:
            ok_nome = True
            if base == "COMPRIMIDO" and nome == "CAPSULA" or base == "CAPSULA" and nome in ("COMPRIMIDO", "DRAGEA"):
                ok_nome = False
        elif tipo and nome in NOMES_UNIDADE.get(tipo, set()):
            ok_nome = True
        elif tipo is None:
            ok_nome = True
        elif nome == limpar(tipo):
            ok_nome = True
        if not ok_nome:
            continue
        sig = limpar(u.sigla)
        if u.capacidade and sig in ("UI", "U", "MCG") and len(r.ap.doses) == 1 and r.ap.doses[0].den is None:
            d = r.ap.doses[0]
            alvo = d.valor if d.unidade == "UI" else (d.valor * 1000 if sig == "MCG" and d.unidade == "MG" else None)
            if alvo and iguais(alvo, u.capacidade, 0.011):
                exatas.append(u)
                comp.append(u)
            elif alvo is None:
                comp.append(u)
            continue
        if u.capacidade and sig in ("ML", "G", "L", "MG", "DOSE", "DOSES", "KG"):
            cap = u.capacidade * (1000 if sig in ("L", "KG") else 1)
            cun = "ML" if sig in ("ML", "L") else ("G" if sig in ("G", "KG") else ("DOSE" if sig.startswith("DOSE") else sig))
            if sig == "MG":
                cap, cun = cap / 1000, "G"
            if vol and vun == cun and iguais(cap, vol, 0.011):
                exatas.append(u)
                comp.append(u)
            elif vol is None:
                comp.append(u)
            continue
        comp.append(u)
        if base in ("COMPRIMIDO", "CAPSULA") and nome in ("COMPRIMIDO", "CAPSULA", "DRAGEA"):
            exatas.append(u)
        elif tipo and nome == limpar(tipo) and not vol:
            exatas.append(u)
    return exatas, comp


def g7_unidade(r: Registro, it: Item, P: Pontes, av: Avaliacao) -> Guarda:
    if not it.unidades:
        return Guarda("G7", False if it.situacao == "Ativo" else None, "CATMAT sem unidade de fornecimento")
    exatas, comp = unidades_compativeis(r, it)
    av.unidades = exatas or comp
    if exatas:
        return Guarda("G7", True)
    if comp:
        return Guarda("G7", True, "unidade compatível sem conteúdo igual")
    us = ", ".join(u.texto for u in it.unidades[:4])
    return Guarda("G7", False, f"nenhuma unidade oficial compatível ({us})")


# ---------------------------------------------------------------------------
# G1 catalogo

def g1_catalogo(r: Registro, it: Item | None, P: Pontes, av: Avaliacao, no_csv: bool = True) -> Guarda:
    if it is None or not no_csv:
        return Guarda("G1", False, "código fora do catálogo 11/07")
    if it.situacao is None:
        return Guarda("G1", False, "situação desconhecida (ausente da extração de unidades)")
    if it.situacao != "Ativo":
        return Guarda("G1", False, "CATMAT inativo")
    fl = set(it.flags) - {"nome"}
    if fl:
        return Guarda("G1", False, "item " + "/".join(sorted(fl)))
    return Guarda("G1", True)


def avaliar(r: Registro, it: Item, P: Pontes, ctx=None) -> Avaliacao:
    """ctx = Catalogo (para R4: 'diferencia quando houver CATMAT proprio')."""
    av = Avaliacao(it.codigo, [])
    av.guardas.append(g1_catalogo(r, it, P, av, ctx.no_csv(it.codigo) if ctx is not None else True))
    av.guardas.append(g2_ingredientes(r, it, P, av))
    av.guardas.append(g3_dose(r, it, P, av))
    av.guardas.append(g4_forma(r, it, P, av, ctx))
    av.guardas.append(g5_acessorio(r, it, P, av, ctx))
    av.guardas.append(g6_classe(r, it, P, av))
    av.guardas.append(g7_unidade(r, it, P, av))
    if av.essenciais:
        av.grau = "essencial"
    return av
