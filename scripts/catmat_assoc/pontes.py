"""
Dicionarios aprendidos da propria GP (secoes 3.3, 3.4 e 3.9 do prompt).

  ingrediente -> PDM         (monodrogas; com contagem)       "HEMIFUMARATO DE QUETIAPINA" -> QUETIAPINA
  nome-base   -> PDM         (idem, pelo nome sem sal)
  conjunto    -> PDM         (associacoes: frozenset de ingredientes)
  forma CMED  -> unidade     (resumo da forma + recipiente primario -> unidade usada)
  CATMAT      -> unidades    (unidade de fornecimento ja usada pela GP para o CATMAT)
  PDM         -> classes     (classe terapeutica da lista mensal, nivel 1 e 2)
  ingrediente -> razao dose  (sal x base observado na GP: dose CATMAT / dose CMED)

Tudo e recalculado a cada rodada (e por dobra no backtest), entao as decisoes
confirmadas pelo usuario viram ponte na rodada seguinte.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .catalogo import Catalogo, Item
from .normaliza import iguais, leituras, limpar, nome_base
from .registro import Registro

# Pontes que a GP pode nao ter (citadas no prompt, secao 3.3). Fonte: DCB/INN e o proprio prompt.
PONTES_MANUAIS: dict[str, tuple[str, ...]] = {
    "MESSALAZINA": ("MESALAZINA",),
    "ORLIPASTAT": ("ORLISTATE",),
    "ERITROPOIETINA": ("ALFAEPOETINA",),
    "ALFAEPOETINA": ("ALFAEPOETINA", "ERITROPOETINA", "ERITROPOIETINA"),
    "MECOBALAMINA": ("VITAMINA B12", "MECOBALAMINA", "COBALAMINA"),
    "CIANOCOBALAMINA": ("VITAMINA B12",),
    "VALPROATO DE SODIO": ("ACIDO VALPROICO",),
    "FERRIPOLIMALTOSE": ("HIDROXIDO DE FERRO III", "FERRO III", "FERRIPOLIMALTOSE"),
    "ONASEMNOGENO ABEPARVOVEQUE": ("ONASEMNOGENE ABEPARVOVEC",),
    "AXETILCEFUROXIMA": ("CEFUROXIMA",),
    "TRIBENOSIDEO": ("TRIBENOSIDO", "TRIBENOSIDEO"),
    "COLECALCIFEROL": ("COLECALCIFEROL", "VITAMINA D3", "VITAMINA D"),
    "ERGOCALCIFEROL": ("VITAMINA D2", "ERGOCALCIFEROL"),
    "ACIDO ASCORBICO": ("ACIDO ASCORBICO", "VITAMINA C"),
    "RETINOL": ("VITAMINA A", "RETINOL"),
    "TOCOFEROL": ("VITAMINA E", "TOCOFEROL"),
    "ACETATO DE RACEALFATOCOFEROL": ("VITAMINA E", "TOCOFEROL"),
    "TIAMINA": ("VITAMINA B1", "TIAMINA"),
    "PIRIDOXINA": ("VITAMINA B6", "PIRIDOXINA"),
    "FITOMENADIONA": ("VITAMINA K", "FITOMENADIONA"),
    "PROTEINA CARREADORA": (),
    # sinonimos DCB/INN e nomes usuais (Farmacopeia/DCB)
    "VITAMINA E": ("RACEALFATOCOFEROL", "TOCOFEROL", "ACETATO DE TOCOFEROL", "ALFATOCOFEROL"),
    "VITAMINA A": ("RETINOL", "PALMITATO DE RETINOL"),
    "VITAMINA C": ("ACIDO ASCORBICO",),
    "VITAMINA B1": ("TIAMINA",), "VITAMINA B6": ("PIRIDOXINA",), "VITAMINA B12": ("CIANOCOBALAMINA",),
    "VITAMINA D3": ("COLECALCIFEROL",), "VITAMINA K": ("FITOMENADIONA",), "VITAMINA K1": ("FITOMENADIONA",),
    "NITROFURAZONA": ("NITROFURAL",), "NITROFURAL": ("NITROFURAZONA",),
    "CARBOMER": ("CARBOMERO", "ACIDO POLIACRILICO"), "CARBOMERO": ("CARBOMER", "ACIDO POLIACRILICO"),
    "ACIDO SELENIOSO": ("SELENIO",), "SELENITO DE SODIO": ("SELENIO",),
    "GANGLIOSIDEO GM1": ("MONOSSIALOGANGLIOSIDEO",),
    "GONADOTROFINA CORIONICA": ("GONADOTROPINA",), "SOMATROPINA": ("SOMATOTROFINA",),
    "EPINEFRINA": ("ADRENALINA",), "NOREPINEFRINA": ("NORADRENALINA",), "PARACETAMOL": ("ACETAMINOFENO",),
    "DIPIRONA": ("METAMIZOL",), "ESCOPOLAMINA": ("HIOSCINA",), "LIDOCAINA": ("XILOCAINA",),
    "ALFALGLICOSIDASE": ("ALFA-ALGLICOSIDASE", "ALGLICOSIDASE ALFA"),
    "BETADINUTUXIMABE": ("DINUTUXIMABE",),
    "LOSARTAN": ("LOSARTANA",), "LOSARTAN POTASSICO": ("LOSARTANA POTASSICA",),
    "TRIGLICERIDEOS DE CADEIA MEDIA": ("TRIGLICERIDEOS DE CADEIA MEDIA", "TCM"),
    "ION CITRATO": ("ACIDO CITRICO", "CITRATO"),
}

# Aminoacidos: o catalogo escreve as siglas (ALA, ARG, PHE...)
SIGLA_AMINOACIDO = {
    "ALANINA": "ALA", "ARGININA": "ARG", "FENILALANINA": "PHE", "GLICINA": "GLY", "HISTIDINA": "HIS",
    "ISOLEUCINA": "ILE", "LEUCINA": "LEU", "LISINA": "LYS", "METIONINA": "MET", "PROLINA": "PRO", "SERINA": "SER",
    "TIROSINA": "TYR", "TREONINA": "THR", "TRIPTOFANO": "TRP", "VALINA": "VAL", "CISTEINA": "CYS",
    "ACIDO ASPARTICO": "ASP", "ACIDO GLUTAMICO": "GLU", "GLUTAMINA": "GLN", "ASPARAGINA": "ASN",
}


def sal_acido(nome: str) -> set[str]:
    """Regra DCB: "FUSIDATO DE SODIO" <-> "ACIDO FUSIDICO"; "VALPROATO" <-> "ACIDO VALPROICO"."""
    n = limpar(nome)
    out = set()
    m = re.match(r"^([A-Z]+?)ATO(?: (?:DE )?(?:SODIO|POTASSIO|CALCIO|MAGNESIO|SODICO|DISSODICO|MONOSSODICO))?$", n)
    if m and len(m.group(1)) >= 4:
        out.add(f"ACIDO {m.group(1)}ICO")
    m = re.match(r"^ACIDO ([A-Z]+?)ICO$", n)
    if m and len(m.group(1)) >= 4:
        out.add(f"{m.group(1)}ATO")
    return out

# PDMs de categoria: o ingrediente vira atributo (secao 3.3)
PDM_CATEGORIA = (
    "CONTRASTE RADIOLOGICO", "EXTRATO MEDICINAL", "CONCENTRADO DE FATOR", "PROBIOTICO", "SOLUCAO PARA HEMODIALISE",
    "SOLUCAO PARA DIALISE", "SOLUCAO DIALISE", "EMULSAO DE LIPIDIOS", "NUTRICAO PARENTERAL", "IMUNOGLOBULINA",
    "INTERFERONA", "INSULINA", "FOLITROPINA", "VACINA", "AGUA DESTILADA", "AGUA PARA INJETAVEL", "SORO",
    "MULTIVITAMINAS", "POLIVITAMINICO", "SAIS PARA REIDRATACAO", "AMINOACIDOS", "RADIOFARMACO", "ALERGENO",
    "FITOTERAPICO", "HOMEOPATICO", "SOLUCAO", "OLIGOELEMENTOS", "ELETROLITOS",
)


def eh_categoria(pdm: str) -> bool:
    p = limpar(pdm)
    return any(p.startswith(c) for c in PDM_CATEGORIA)


def classe_nivel(classe: str, n: int) -> str:
    m = re.match(r"\s*([A-Z0-9]+)", limpar(classe))
    return m.group(1)[:n] if m else ""


@dataclass
class Pontes:
    ing_pdm: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    base_pdm: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    conj_pdm: dict[frozenset, Counter] = field(default_factory=lambda: defaultdict(Counter))
    conj_catmats: dict[frozenset, Counter] = field(default_factory=lambda: defaultdict(Counter))
    ing_catmats: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    forma_un: dict[tuple, Counter] = field(default_factory=lambda: defaultdict(Counter))
    catmat_un: dict[int, Counter] = field(default_factory=lambda: defaultdict(Counter))
    pdm_classe: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    razao: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    forma_par: Counter = field(default_factory=Counter)  # (forma reg, forma cat) -> n
    pdms_usados: Counter = field(default_factory=Counter)
    uso_catmat: Counter = field(default_factory=Counter)  # CATMAT -> vinculos da GP

    def nomes(self, ing: str) -> set[str]:
        """Todos os nomes pelos quais o ingrediente pode aparecer no catalogo.
        Ponte aprendida so vale quando nao e ruido: e a unica, ou tem >= 2 vinculos e >= 10% do total
        (um vinculo errado da GP, como FENTANILA -> SUFENTANILA, nao vira sinonimo)."""
        ing = limpar(ing)
        b = nome_base(ing)
        out = {ing, b}
        sem_num = re.sub(r"(?:\s+\d+[A-Z]?)+$", "", b).strip()  # "CARBOMER 340" -> "CARBOMER"
        if len(sem_num) >= 5:
            out.add(sem_num)
        for k in (ing, b, sem_num):
            out |= set(PONTES_MANUAIS.get(k, ()))
            out |= sal_acido(k)
        for cont in (self.ing_pdm.get(ing, Counter()), self.base_pdm.get(b, Counter())):
            tot = sum(cont.values())
            for pdm, n in cont.items():
                if len(cont) == 1 or (n >= 2 and n >= 0.1 * tot):
                    out.add(pdm)
        return {x for x in out if x and len(x) >= 3}

    def pdm_para(self, ing: str) -> Counter:
        ing = limpar(ing)
        c = Counter(self.ing_pdm.get(ing, Counter()))
        if not c:
            c = Counter(self.base_pdm.get(nome_base(ing), Counter()))
        return c


def chave_forma(r: Registro) -> tuple:
    p = r.ap.primario
    return (r.ap.forma.base, r.ap.forma.familia, p.tipo if p else None)


def aprender(pares: list[tuple[Registro, Item]], unidade_de: dict[str, str] | None = None) -> Pontes:
    """pares = vinculos (registro, item do CATMAT). unidade_de: registro -> unidade gravada na GP."""
    P = Pontes()
    for r, it in pares:
        pdm = it.pdm
        P.pdms_usados[pdm] += 1
        P.uso_catmat[it.codigo] += 1
        if len(r.ingredientes) == 1 and not r.substancia_incompleta:
            ing = r.ingredientes[0]
            P.ing_pdm[ing][pdm] += 1
            P.base_pdm[nome_base(ing)][pdm] += 1
            P.ing_catmats[ing][it.codigo] += 1
            # razao de dose (sal x base): uma dose de cada lado, mesma grandeza, diferente
            if len(r.ap.doses) == 1 and len(it.doses) == 1:
                lr = leituras(r.ap.doses[0], r.ap)
                lc = leituras(it.doses[0])
                if not any(a[0] == b[0] and iguais(a[1], b[1]) for a in lr for b in lc):
                    for a in lr:
                        for b in lc:
                            if a[0] == b[0] and a[1] > 0:
                                q = b[1] / a[1]
                                if 0.3 <= q <= 3.0 and not 0.98 <= q <= 1.02:
                                    P.razao[ing][round(q, 3)] += 1
        P.conj_pdm[frozenset(r.ingredientes)][pdm] += 1
        P.conj_catmats[frozenset(r.ingredientes)][it.codigo] += 1
        if unidade_de is not None and r.registro in unidade_de:
            u = unidade_de[r.registro]
            P.forma_un[chave_forma(r)][limpar(u).split(" ")[0] if u else ""] += 1
            P.catmat_un[it.codigo][u] += 1
        if r.classe:
            P.pdm_classe[pdm][classe_nivel(r.classe, 1)] += 1
            P.pdm_classe[pdm][classe_nivel(r.classe, 2)] += 1
        P.forma_par[(r.ap.forma.resumo(), it.forma.resumo())] += 1
    return P
