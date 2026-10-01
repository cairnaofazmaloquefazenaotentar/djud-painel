"""
Normalizacao deterministica dos textos da CMED (secao 5.2 do prompt).

  limpar()             sem acento, maiusculas, \\xa0 e espacos repetidos -> um espaco
  ingredientes()       SUBSTANCIA "A;B" -> ('A', 'B') normalizados e ordenados
  nome_base()          ingrediente sem sal/hidrato ("HEMIFUMARATO DE QUETIAPINA" -> "QUETIAPINA")
  separar_prefixo()    apresentacao -> (prefixo ate o 1o marcador de embalagem, resto)
  assinatura()         ingredientes + " | " + prefixo normalizado (secao 3.2)
  acessorios()         marcadores depois do prefixo (DIL, SIST FECH, SER, CAN...)
  doses()              doses do texto (R3): "(300 + 35 + 50) MG", "250 MG/5 ML", "50.000 UI"
  forma()              forma farmaceutica, via, liberacao e modificadores (R4)
  parse_apresentacao() tudo acima + recipiente primario, conteudo e contagens
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Texto


def sem_acento(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if not unicodedata.combining(ch))


def limpar(s: object) -> str:
    """Maiusculas, sem acento, \\xa0 -> espaco, espacos colapsados."""
    if s is None:
        return ""
    t = str(s).replace("\xa0", " ").replace("_x000D_", " ")
    t = sem_acento(t).upper()
    t = t.replace("Μ", "MC").replace("µ", "MC")  # micro
    return re.sub(r"\s+", " ", t).strip()


def numero(txt: str) -> float | None:
    """'1,5' -> 1.5 · '50.000' -> 50000 · '0.3' -> 0.3 · '1.234,56' -> 1234.56."""
    t = txt.strip().replace(" ", "")
    if not t:
        return None
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    elif re.fullmatch(r"[1-9]\d{0,2}(?:\.\d{3})+", t):
        t = t.replace(".", "")  # separador de milhar
    try:
        return float(t)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Ingredientes

# Sais/esteres que aparecem NA FRENTE do nome em DCB ("CLORIDRATO DE X").
SAIS = {
    "ACEPONATO", "ACETATO", "ACETONIDO", "ACETONIDA", "ASPARTATO", "AXETIL", "BENZATINA", "BENZOATO",
    "BESILATO", "BISSULFATO", "BITARTARATO", "BROMETO", "BROMIDRATO", "BUTILBROMETO", "BUTIRATO",
    "CANSILATO", "CARBONATO", "CIPIONATO", "CITRATO", "CLORETO", "CLORIDRATO", "CROMOGLICATO",
    "DECANOATO", "DICLORIDRATO", "DIESILATO", "DIMESILATO", "DIPROPIONATO", "DISSULFETO",
    "ENANTATO", "ESILATO", "ESTEARATO", "ESTOLATO", "ETABONATO", "ETEXILATO", "FENILPROPIONATO",
    "FOSFATO", "FUMARATO", "FUROATO", "GLUCONATO", "GLUCEPTATO", "HEMIFUMARATO", "HEMISSULFATO",
    "HEMITARTARATO", "HEXANOATO", "HICLATO", "HIDROBROMETO", "HIDROCLORETO", "HIDROGENOTARTARATO",
    "HIDROXIDO", "IODETO", "ISETIONATO", "ISONICOTINATO", "LACTATO", "LACTOBIONATO", "LAURILSULFATO",
    "LISINATO", "MALATO", "MALEATO", "MESILATO", "METILSULFATO", "MONONITRATO", "NAPADISILATO", "NITRATO",
    "OLEATO", "OXALATO", "OXIDO", "PALMITATO", "PAMOATO", "PIVALATO", "PROPIONATO", "SACARATO",
    "SALICILATO", "SODICO", "SUCCINATO", "SULFATO", "TANATO", "TARTARATO", "TEOCLATO", "TOSILATO",
    "TRIFENATATO", "TROMETAMOL", "UNDECILATO", "UNDECANOATO", "VALERATO", "XINAFOATO", "ZINCO",
    "DIPROPIONATO", "PROPIONATO", "ACETATO", "MICOFENOLATO", "BUTIRATO", "CLORIDRATO",
    "FOSFATO DISSODICO", "FOSFATO SODICO", "SUCCINATO SODICO", "DIIDROGENOFOSFATO",
}
CATIONS = ("SODIO", "POTASSIO", "CALCIO", "MAGNESIO", "ZINCO", "LITIO", "ALUMINIO", "MEGLUMINA",
           "ARGININA", "LISINA", "DIETILAMONIO", "TROMETAMOL", "COLINA", "FERRO", "AMONIO", "ESTRONCIO")
ELEMENTOS = {"SODIO", "POTASSIO", "CALCIO", "MAGNESIO", "ZINCO", "LITIO", "ALUMINIO", "FERRO", "AMONIO", "ESTRONCIO",
             "COBRE", "MANGANES", "SELENIO", "CROMO", "IODO", "FLUOR", "BARIO", "BISMUTO", "PRATA", "OURO", "COBALTO",
             "MOLIBDENIO", "FOSFORO", "ENXOFRE", "CLORO", "BORO", "LANTANIO", "SEVELAMER", "ACIDO"}
ADJ_CATION = (r"(?:DI|TRI|MONO)?(?:SODIC[OA]|POTASSIC[OA]|CALCIC[OA]|MAGNESIC[OA]|DISSODIC[OA]|LITIC[OA]|FERRIC[OA]"
              r"|FERROS[OA]|DIETILAMONIO|MEGLUMINA|TROMETAMOL|BENZATINA|PROCAINA)")
HIDRATO = (r"(?:(?:MONO|DI|TRI|TETRA|PENTA|HEXA|HEPTA|OCTA|SESQUI|HEMI|HEMIPENTA|HEMIEPTA|HEMI-|DI-|TRI-|MONO-|SESQUI-)"
           r"\s?-?H?IDRATAD[OA]|HIDRATAD[OA]|ANIDR[OA]|MICRONIZAD[OA]|SOLVATAD[OA]|AMORF[OA]|CRISTALIN[OA]"
           r"|MONOIDRATAD[OA]|DI-HIDRATAD[OA]|TRI-HIDRATAD[OA]|HEMI-HIDRATAD[OA]|SESQUI-HIDRATAD[OA]"
           r"|(?:DI|TRI|TETRA|PENTA|HEXA|HEPTA|SESQUI|HEMI|HEMIPENTA|HEMIEPTA)IDRATAD[OA])")


def ingredientes(substancia: object) -> tuple[str, ...]:
    partes = [limpar(x) for x in str(substancia or "").split(";")]
    return tuple(sorted({p for p in partes if p}))


def nome_base(ing: str) -> str:
    """Porcao ativa aproximada: tira sal na frente, cation no fim, hidrato e parenteses."""
    s = limpar(ing)
    s = re.sub(r"\([^)]*\)", " ", s)  # "(11 C)", "(L.) GAERTN"
    s = re.sub(r"^\d+-", "", s)  # "21-ACETATO DE DEXAMETASONA"
    s = re.sub(r"\b" + HIDRATO + r"\b", " ", s)
    s = re.sub(r"\bMICROGRANULOS?(?: A \d+(?:[.,]\d+)?\s*%)?|\bPELLETS?(?: A \d+(?:[.,]\d+)?\s*%)?|\bGRANULADO A \d+\s*%", " ", s)
    s = re.sub(r"^(?:DIMETILSULFOXIDO|ETANOLATO|SOLVATO|CLATRATO) DE ", "", s)
    s = re.sub(r"^.*\bEXPRESSOS? (?:EM|COMO) ", "", s)  # "FLAVONOIDES EXPRESSOS EM HESPERIDINA"
    s = re.sub(r"\s+", " ", s).strip()
    pal = s.split(" ")
    # "CLORIDRATO DE X", "SAL DE X", "SUCCINATO SODICO DE X"
    m = re.match(r"^((?:[A-Z]+ATO|[A-Z]+ETO|[A-Z]+IDRATO|[A-Z]+ITO|OXIDO|HIDROXIDO|ACETONIDA|ACETONIDO)"
                 r"(?: (?:" + ADJ_CATION + r"|DE SODIO|DE POTASSIO))?) DE (.+)$", s)
    if m and len(pal) >= 3 and m.group(1).split(" ")[0] in SAIS | {w for w in [pal[0]] if w.endswith(("ATO", "ETO", "IDRATO"))}:
        s = m.group(2)
    # "X DE SODIO" / "X SODICO"
    s = re.sub(r"\s+(?:DE|DO|DA)\s+(?:" + "|".join(CATIONS) + r")$", "", s)
    s = re.sub(r"\s+" + ADJ_CATION + r"$", "", s)
    s = re.sub(r"\s+(?:BASE|SAL)$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    # sal inorganico: a "porcao ativa" e o proprio sal (CARBONATO DE CALCIO nao e "CALCIO")
    if s in ELEMENTOS or len(s) < 3:
        return re.sub(r"\s+", " ", re.sub(r"\b" + HIDRATO + r"\b", " ", limpar(ing))).strip()
    return s


def sal_de(ing: str) -> str | None:
    """'DIPROPIONATO DE BETAMETASONA' -> 'DIPROPIONATO'; None quando nao ha sal escrito."""
    s = limpar(ing)
    s = re.sub(r"^\d+-", "", s)
    m = re.match(r"^([A-Z]+(?:ATO|ETO|IDRATO|ITO))\b", s)
    if m and " DE " in s:
        return m.group(1)
    m = re.search(r"\s(" + ADJ_CATION + r")$", s)
    if m:
        return m.group(1)
    m = re.search(r"\sDE (" + "|".join(CATIONS) + r")$", s)
    if m:
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# Prefixo, assinatura e acessorios (secao 3.2)

MARCADORES_EMB = (
    "CT", "CX", "EMB", "DISPLAY", "FR", "FRS", "BL", "ENV", "AMP", "FA", "SER", "BG", "BOLS", "SACH", "POT",
    "TB", "GL", "STR", "KIT", "CART", "EST", "BOMB", "BOMBO", "GAL", "PT", "BOLSA", "TUBO", "FILME", "CIL",
    "LAM", "FLAC", "CARP", "BJ", "STRIP", "STP", "CTBG", "CTBL", "CTNFR",
)
_RE_MARCADOR = re.compile(r"(?<![A-Z0-9])(?:" + "|".join(sorted(MARCADORES_EMB, key=len, reverse=True)) + r")(?![A-Z0-9])")

ACESSORIOS = {
    "DIL": r"DIL|DILUENTE",
    "EQP": r"EQP|EQUIPO|EQ",
    "SIST FECH": r"SIST FECH|SISTEMA FECHADO",
    "SER": r"SER|SERINGA|SERINGAS",
    "CAN": r"CAN|CANETA|CANETAS",
    "INAL": r"INAL|INALADOR",
    "APLIC": r"APLIC|APLICADOR|APLICADORES",
    "CAR": r"CAR|REFIL|CARP|CARPULE",
    "BOLS": r"BOLS|BOLSA",
    "AMP": r"AMP",
    "FA": r"FA",
    "ENV": r"ENV|SACH|SACHE",
    "CALEND": r"CALEND",
}
_RE_ACESS = {k: re.compile(r"(?<![A-Z])(?:" + v + r")(?![A-Z])") for k, v in ACESSORIOS.items()}


def separar_prefixo(apresentacao: object) -> tuple[str, str]:
    a = limpar(apresentacao)
    m = _RE_MARCADOR.search(a)
    if not m:
        return a, ""
    pref, resto = a[: m.start()].strip(), a[m.start():].strip()
    # "SUS OR 50 FR PLAS": o numero solto no fim do prefixo e a quantidade de recipientes
    mm = re.search(r"\s(\d+)$", pref)
    if mm and not re.search(r"[+/(]\s*\d+$", pref):
        pref, resto = pref[: mm.start()].strip(), mm.group(1) + " " + resto
    return pref, resto


def normalizar_prefixo(p: str) -> str:
    p = re.sub(r"\s*/\s*", "/", p)
    p = re.sub(r"\s*\+\s*", " + ", p)
    p = re.sub(r"\(\s+", "(", p)
    p = re.sub(r"\s+\)", ")", p)
    p = re.sub(r"(\d)[,.]0+(?!\d)", r"\1", p)
    p = re.sub(r"(\d) (MG|G|MCG|ML|UI|U|MEQ|L|%|MMOL|NG|KG|MUI)(?![A-Z])", r"\1\2", p)
    return re.sub(r"\s+", " ", p).strip()


def assinatura(substancia: object, apresentacao: object) -> str:
    pref, _ = separar_prefixo(apresentacao)
    return ";".join(ingredientes(substancia)) + " | " + normalizar_prefixo(pref)


def acessorios(apresentacao: object) -> frozenset[str]:
    _, resto = separar_prefixo(apresentacao)
    return frozenset(k for k, rx in _RE_ACESS.items() if rx.search(resto))


# ---------------------------------------------------------------------------
# Doses (R3)

MASSA = {"KG": 1e6, "G": 1000.0, "MG": 1.0, "MCG": 1e-3, "UG": 1e-3, "NG": 1e-6}
VOLUME = {"L": 1000.0, "ML": 1.0, "MCL": 1e-3, "UL": 1e-3}
UNID_ATIV = {"UI": 1.0, "U": 1.0, "MUI": 1e6, "KUI": 1e3, "UN": 1.0, "UIA": 1.0}
OUTRAS = {"MEQ": 1.0, "MMOL": 1.0, "MOL": 1000.0, "MBQ": 1.0, "MCI": 1.0, "GBQ": 1000.0, "UFP": 1.0, "UFC": 1.0}
DEN_DOSE = {"DOSE": "DOSE", "DOSES": "DOSE", "ACION": "DOSE", "ACIONAMENTO": "DOSE", "JATO": "DOSE", "JATOS": "DOSE",
            "INAL": "DOSE", "APLIC": "DOSE", "BORRIFADA": "DOSE", "GOTA": "GOTA", "GOT": "GOTA",
            "DIA": "DIA", "24H": "DIA", "24 H": "DIA", "H": "H", "HORA": "H", "CM2": "CM2", "CM²": "CM2"}

UNIDADE_RX = r"(?:MCG|MG|KG|NG|UG|G|MUI|KUI|UI|U|MEQ|MMOL|MOL|MBQ|GBQ|MCI|UFP|UFC|ML|MCL|L|%)"
DEN_RX = r"(?:ML|L|G|MG|KG|DOSES?|ACION(?:AMENTO)?|JATOS?|INAL|APLIC|GOTAS?|GOT|DIA|24 ?H|H|HORA|CM2|CM²|COM|CAP)"
NUM_RX = r"\d+(?:[.,]\d+)*"


@dataclass(frozen=True)
class Dose:
    """valor na unidade canonica (massa -> MG, volume -> ML, atividade -> UI);
    den = denominador canonico (ML, G, DOSE, DIA...) com den_valor (ex.: 5 em 250 MG/5 ML)."""
    valor: float
    unidade: str  # MG, UI, MEQ, MMOL, ML, PCT, MBQ
    den: str | None = None
    den_valor: float = 1.0
    texto: str = ""

    @property
    def por_den(self) -> float:
        return self.valor / self.den_valor if self.den_valor else self.valor

    def __str__(self) -> str:
        return self.texto or f"{self.valor:g} {self.unidade}" + (f"/{self.den}" if self.den else "")


def _canon_unidade(u: str) -> tuple[str, float] | None:
    u = u.upper().replace("µ", "MC")
    if u in MASSA:
        return "MG", MASSA[u]
    if u in UNID_ATIV:
        return "UI", UNID_ATIV[u]
    if u in OUTRAS:
        return u if u not in ("MOL",) else "MMOL", OUTRAS[u]
    if u in VOLUME:
        return "ML", VOLUME[u]
    if u == "%":
        return "PCT", 1.0
    return None


def _canon_den(u: str | None, v: float | None) -> tuple[str | None, float]:
    if not u:
        return None, 1.0
    u = u.upper().strip()
    v = v if v else 1.0
    if u in VOLUME:
        return "ML", v * VOLUME[u]
    if u in MASSA:
        return ("G", v * MASSA[u] / 1000.0)
    k = DEN_DOSE.get(u) or DEN_DOSE.get(u.rstrip("S"))
    if k:
        return k, v
    if u in ("COM", "CAP"):
        return None, 1.0
    return u, v


def _mk(valor: float | None, unid: str, den_v: float | None, den_u: str | None, texto: str) -> Dose | None:
    if valor is None:
        return None
    cu = _canon_unidade(unid)
    if not cu:
        return None
    u, f = cu
    d, dv = _canon_den(den_u, den_v)
    if u == "ML" and d is None:
        return None  # volume solto nao e dose
    return Dose(valor * f, u, d, dv, texto.strip())


_RE_GRUPO = re.compile(
    r"\(\s*(" + NUM_RX + r"(?:\s*" + UNIDADE_RX + r")?(?:\s*\+\s*" + NUM_RX + r"(?:\s*" + UNIDADE_RX + r")?)+)\s*\)\s*"
    r"(" + UNIDADE_RX + r")?(?:\s*/\s*(" + NUM_RX + r")?\s*(" + DEN_RX + r"))?"
)
_RE_GRUPO_SOLTO = re.compile(
    r"(?<![\d.,A-Z/(])(" + NUM_RX + r"(?:\s*\+\s*" + NUM_RX + r")+)\s*(" + UNIDADE_RX + r")(?![A-Z0-9])"
    r"(?:\s*/\s*(" + NUM_RX + r")?\s*(" + DEN_RX + r")(?![A-Z]))?"
)
_RE_SEM_UNIDADE = re.compile(r"(" + NUM_RX + r")\s*(" + UNIDADE_RX + r")(?:/(" + DEN_RX + r"))?\s*\+\s*(" + NUM_RX + r")(?=\s+(?:COM|CAP|DRG|SOL|SUS|CREM|POM|GEL)\b)")
_RE_SIMPLES = re.compile(
    r"(?<![\d.,A-Z])(" + NUM_RX + r")\s*(" + UNIDADE_RX + r")(?![A-Z0-9])"
    r"(?:\s*/\s*(" + NUM_RX + r")?\s*(" + DEN_RX + r")(?![A-Z]))?"
)


def doses(texto: object) -> list[Dose]:
    """Doses na ordem em que aparecem. Grupo "(a + b) MG/ML" distribui unidade e denominador."""
    t = limpar(texto)
    t = re.sub(r"(\d)\s*([.,])\s*(\d)", r"\1\2\3", t)
    t = t.replace("MCG/ ", "MCG/").replace("µG", "MCG")
    t = re.sub(r"(\d\s*(?:MG|MCG|G|UI|U))\s+ML\b", r"\1/ML", t)  # "75 MG ML" = 75 MG/ML
    t = re.sub(r"(\d)\s*PCC\b", r"\1%", t)  # "20 PCC" = 20%
    t = re.sub(r"(MG|MCG|G)\s+DE\s+(?:IODO|FERRO|FERRO ELEMENTAR|ZINCO|CALCIO|POTASSIO|SODIO|MAGNESIO|BASE|SABINENO)\s*/", r"\1/", t)
    t = _RE_SEM_UNIDADE.sub(lambda m: f"{m.group(1)} {m.group(2)}{'/' + m.group(3) if m.group(3) else ''} + {m.group(4)} {m.group(2)}{'/' + m.group(3) if m.group(3) else ''}", t)
    res: list[tuple[int, Dose]] = []
    ocupado: list[tuple[int, int]] = []
    for m in _RE_GRUPO.finditer(t):
        unid, denv, denu = m.group(2), m.group(3), m.group(4)
        itens = [x.strip() for x in m.group(1).split("+")]
        ds = []
        for it in itens:
            mm = re.fullmatch(r"(" + NUM_RX + r")\s*(" + UNIDADE_RX + r")?", it)
            if not mm:
                ds = []
                break
            u = mm.group(2) or unid
            if not u:
                ds = []
                break
            d = _mk(numero(mm.group(1)), u, numero(denv) if denv else None, denu, it + (f" {unid}" if not mm.group(2) and unid else ""))
            if d:
                ds.append(d)
        if ds:
            for i, d in enumerate(ds):
                res.append((m.start() + i, d))
            ocupado.append((m.start(), m.end()))
    for m in _RE_GRUPO_SOLTO.finditer(t):
        if any(a <= m.start() < b for a, b in ocupado):
            continue
        nums = [x.strip() for x in m.group(1).split("+")]
        ds = [_mk(numero(x), m.group(2), numero(m.group(3)) if m.group(3) else None, m.group(4), f"{x} {m.group(2)}")
              for x in nums]
        if all(ds):
            for i, d in enumerate(ds):
                res.append((m.start() + i, d))
            ocupado.append((m.start(), m.end()))
    for m in _RE_SIMPLES.finditer(t):
        if any(a <= m.start() < b for a, b in ocupado):
            continue
        d = _mk(numero(m.group(1)), m.group(2), numero(m.group(3)) if m.group(3) else None, m.group(4), m.group(0))
        if d:
            res.append((m.start(), d))
    res.sort(key=lambda x: x[0])
    return [d for _, d in res]


def doses_compartilhando_denominador(ds: list[Dose]) -> list[Dose]:
    """"10 MG + 0,4 MG/G" (estilo do catalogo) -> o /G vale para todos os componentes."""
    if len(ds) >= 2 and ds[-1].den and all(d.den is None for d in ds[:-1]) and all(d.unidade == ds[-1].unidade or d.unidade in ("MG", "UI") for d in ds):
        return [Dose(d.valor, d.unidade, ds[-1].den, ds[-1].den_valor, d.texto) for d in ds[:-1]] + [ds[-1]]
    return ds


# ---------------------------------------------------------------------------
# Forma farmaceutica (R4)

FORMA_CMED = {
    "COM": "COMPRIMIDO", "COMP": "COMPRIMIDO", "CP": "COMPRIMIDO", "CPR": "COMPRIMIDO", "DRG": "COMPRIMIDO",
    "CGT": "COMPRIMIDO",
    "CAP": "CAPSULA", "CAPS": "CAPSULA",
    "SOL": "SOLUCAO", "SUS": "SUSPENSAO", "SUSP": "SUSPENSAO", "EMU": "EMULSAO", "EMUL": "EMULSAO",
    "PO": "PO", "GRAN": "GRANULADO", "XPE": "XAROPE", "ELX": "ELIXIR",
    "CREM": "CREME", "POM": "POMADA", "GEL": "GEL", "LOC": "LOCAO", "PAST": "PASTILHA", "PAS": "PASTILHA",
    "PER": "CAPSULA", "GOM": "GOMA", "PASTA": "PASTA",
    "ADES": "ADESIVO", "SUP": "SUPOSITORIO", "OVL": "OVULO", "OVU": "OVULO", "AER": "AEROSSOL", "SPR": "SPRAY",
    "SPRAY": "SPRAY", "XAMP": "XAMPU", "COLUT": "COLUTORIO", "IMPL": "IMPLANTE", "ESM": "ESMALTE", "OLEO": "OLEO",
    "GOMA": "GOMA", "TINT": "TINTURA", "FILM": "FILME", "ANEL": "ANEL", "SAB": "SABONETE", "UNG": "POMADA",
    "LIQ": "SOLUCAO", "GAS": "GAS", "DIU": "DIU", "SIU": "DIU", "ESP": "ESPUMA", "EMPL": "ADESIVO",
    "PELICULA": "FILME", "BAST": "BASTAO", "TAB": "TABLETE",
}
VIA_CMED = {
    "OR": "ORAL", "ORAL": "ORAL", "BUC": "ORAL", "SUBL": "ORAL", "GOT": "ORAL",
    "INJ": "INJ", "INFUS": "INJ", "IV": "INJ", "IM": "INJ", "SC": "INJ", "ID": "INJ", "IT": "INJ", "IVIT": "INJ",
    "EPID": "INJ", "INTRAVESICAL": "INJ", "IA": "INJ", "IO": "INJ", "INTRAOC": "INJ", "INTRACAV": "INJ",
    "OFT": "OFT", "NAS": "NASAL", "DERM": "TOP", "TOP": "TOP", "CAPI": "TOP", "CUT": "TOP",
    "OTO": "OTO", "OTOL": "OTO", "INAL": "INAL", "RET": "RETAL", "VAG": "VAG", "TRANSD": "TRANSD", "URET": "URET",
    "HD": "DIALISE", "DIAL": "DIALISE", "HEMO": "DIALISE", "IRRIG": "IRRIG",
}
LIB_CMED = {"PROL": "PROL", "CONT": "PROL", "LENTA": "PROL", "EST": "PROL", "PROLONG": "PROL", "ESTEND": "PROL",
            "RETARD": "RETARD", "RET": "RETARD", "ENT": "RETARD", "MOD": "MOD", "REPET": "MOD", "BIF": "MOD"}
# liberacao escrita sem "LIB": "COM AP" (acao prolongada), "DES LENTA", "CAP RETARD", "MICROG EST"
LIB_SOLTA = [(r"\b(?:AP|LP|SR|XR|XL|CR|ER)\b", "PROL"), (r"\bDES(?:INT)? LENTA\b", "PROL"), (r"(?<!LIB )\bRETARD\b", "PROL"),
             (r"\b(?:MICROG|MCGRAN) (?:EST|AP|LIB PROL)\b", "PROL"), (r"\bGASTRO-?RESIST", "RETARD")]
MOD_CMED = {"ORODISP": "ORODISP", "SUBL": "SUBL", "MAST": "MAST", "EFEV": "EFEV", "EFERV": "EFEV", "DISP": "DISP",
            "DISPERS": "DISP", "BUC": "BUCAL", "LIOF": "LIOF", "DIL": "DIL", "GOT": "GOTAS", "MICROG": "MICROGRAN",
            "MCGRAN": "MICROGRAN", "VAG": "VAG", "DESINT": "DESINT"}


@dataclass
class Forma:
    base: str | None = None  # COMPRIMIDO, CAPSULA, SOLUCAO, PO, CREME...
    vias: set[str] = field(default_factory=set)
    lib: str | None = None  # PROL, RETARD, MOD
    mods: set[str] = field(default_factory=set)  # ORODISP, SUBL, MAST, EFEV, DISP, LIOF, DIL, GOTAS...
    para: str | None = None  # PO P/ SUS -> SUSPENSAO; PO P/ SOL INJ -> SOLUCAO

    @property
    def familia(self) -> str:
        return familia_de(self.base, self.vias, self.mods)

    def resumo(self) -> str:
        p = [self.base or "?"]
        if self.para:
            p.append("P/" + self.para)
        if self.lib:
            p.append("LIB " + self.lib)
        p += sorted(self.mods - {"LIOF"}) + (["LIOF"] if "LIOF" in self.mods else [])
        if self.vias:
            p.append("/".join(sorted(self.vias)))
        return " ".join(p)


def familia_de(base: str | None, vias: set[str], mods: set[str]) -> str:
    """Grande familia de via, usada pela guarda G4 (oral x injetavel x topico x ...)."""
    for v in ("INJ", "OFT", "INAL", "NASAL", "OTO", "VAG", "RETAL", "TRANSD", "DIALISE", "URET", "IRRIG"):
        if v in vias:
            return v
    if "VAG" in mods:
        return "VAG"
    if base in ("ADESIVO",):
        return "TRANSD"
    if base in ("OVULO", "ANEL"):
        return "VAG"
    if base in ("SUPOSITORIO",):
        return "RETAL"
    if base in ("DIU", "IMPLANTE"):
        return "IMPLANTE"
    if "TOP" in vias or base in ("CREME", "POMADA", "LOCAO", "XAMPU", "ESMALTE", "SABONETE", "PASTA", "ESPUMA", "BASTAO"):
        return "TOP"
    if "ORAL" in vias or base in ("COMPRIMIDO", "CAPSULA", "XAROPE", "ELIXIR", "GRANULADO", "PASTILHA", "GOMA",
                                   "COLUTORIO", "FILME", "TABLETE"):
        return "ORAL"
    if base == "GEL":
        return "TOP"
    return "?"


def forma(prefixo: str) -> Forma:
    """Le forma/via/liberacao do prefixo da apresentacao (sem as doses)."""
    t = limpar(prefixo)
    t = _RE_GRUPO.sub(" ", t)
    t = _RE_SIMPLES.sub(" ", t)
    t = re.sub(r"\bP\s*/\s*", "P/ ", t)
    t = re.sub(r"\bCP (?=DURA|MOLE|GEL)", "CAP ", t)  # "CP DURA" = capsula dura
    drg = bool(re.search(r"\bDRG\b", t))
    t = re.sub(r"[()/,+]", " ", t)
    toks = [x for x in t.split() if x]
    f = Forma()
    i = 0
    while i < len(toks):
        tk = toks[i]
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        if tk == "LIB" and nxt:
            f.lib = LIB_CMED.get(nxt[:7], LIB_CMED.get(nxt, "MOD"))
            i += 2
            continue
        if tk == "P" and nxt:
            i += 1
            continue
        if tk in ("P/",):
            if nxt in FORMA_CMED:
                f.para = FORMA_CMED[nxt]
                i += 2
                continue
            i += 1
            continue
        if tk == "GEL" and f.base == "CAPSULA":
            i += 1
            continue
        if tk == "SUS" and f.base == "COMPRIMIDO":
            f.mods.add("DISP")
            i += 1
            continue
        if tk in ("SOL", "SUS", "EMU") and f.base == "PO" and not f.para:
            f.para = FORMA_CMED[tk]
            i += 1
            continue
        if tk == "SOL" and f.base in ("AEROSSOL", "SPRAY", "GEL"):
            i += 1
            continue
        if tk == "INAL":
            f.vias.add("INAL")
            i += 1
            continue
        if tk in FORMA_CMED and (f.base is None or (f.base in ("SOLUCAO", "SUSPENSAO") and FORMA_CMED[tk] in ("AEROSSOL", "SPRAY", "GEL"))):
            novo = FORMA_CMED[tk]
            if f.base in ("SOLUCAO", "SUSPENSAO") and novo in ("AEROSSOL", "SPRAY"):
                f.mods.add(novo)
            else:
                f.base = novo
            i += 1
            continue
        if tk in FORMA_CMED and f.base is not None:
            # segunda forma: "SOL GOT", "PO EFEV", "CREM VAG": vira modificador
            sec = FORMA_CMED[tk]
            if sec in ("AEROSSOL", "SPRAY"):
                f.mods.add(sec)
            elif f.base == "PO" and sec in ("SOLUCAO", "SUSPENSAO", "EMULSAO") and not f.para:
                f.para = sec
            i += 1
            continue
        if tk in MOD_CMED:
            f.mods.add(MOD_CMED[tk])
        if tk in VIA_CMED:
            f.vias.add(VIA_CMED[tk])
        i += 1
    if f.lib is None:
        for rx, v in LIB_SOLTA:
            if re.search(rx, t):
                f.lib = v
                break
    if drg:
        f.mods.add("DRG")
    if "GOTAS" in f.mods and not f.vias & {"OFT", "NASAL", "OTO"}:
        f.vias.add("ORAL")
    if f.base == "PO" and "LIOF" in f.mods and not f.vias:
        f.vias.add("INJ")
    if f.base == "PO" and f.para and not f.vias and f.para in ("SOLUCAO", "SUSPENSAO") and "INJ" not in f.vias:
        pass
    return f


# ---------------------------------------------------------------------------
# Recipiente, conteudo e contagens

RECIPIENTES = {
    "BL": "BLISTER", "STR": "STRIP", "STRIP": "STRIP", "STP": "STRIP", "FR": "FRASCO", "FRS": "FRASCO",
    "FA": "FRASCO-AMPOLA", "AMP": "AMPOLA", "SER": "SERINGA", "BG": "BISNAGA", "TB": "BISNAGA", "TUBO": "BISNAGA",
    "BOLS": "BOLSA", "BOLSA": "BOLSA", "ENV": "ENVELOPE", "SACH": "SACHE", "SACHE": "SACHE", "POT": "POTE",
    "PT": "POTE", "GL": "GALAO", "GAL": "GALAO", "BOMB": "GALAO", "BOMBO": "GALAO", "CAR": "CARPULE",
    "CARP": "CARPULE", "CART": "CARPULE", "FLAC": "FLACONETE", "CAN": "CANETA", "CIL": "CILINDRO",
    "LAM": "BLISTER", "KIT": "KIT", "DISPLAY": "DISPLAY", "EST": "ESTOJO", "BJ": "BISNAGA", "APLIC": "APLICADOR",
    "ESTOJ": "ESTOJO", "TUB": "TUBETE",
}
CAIXAS = ("CT", "CX", "EMB", "DISPLAY", "CTBG", "CTBL", "CTNFR", "CART")
CONTEUDO_RX = re.compile(r"\bX\s*(" + NUM_RX + r")\s*(ML|L|G|MG|KG|DOSES?|ACIONAMENTOS?|ACION|CM|LITROS?)\b")


@dataclass
class Recipiente:
    tipo: str
    qtd: int = 1  # quantos deste recipiente (CT 10 FA -> 10)
    unidades: int | None = None  # X 30 (unidades dentro dele)
    conteudo: float | None = None  # X 150 ML -> 150
    conteudo_un: str | None = None  # ML / G / DOSE
    acessorio: bool = False  # veio depois de "+"


@dataclass
class Apresentacao:
    texto: str
    prefixo: str
    resto: str
    doses: list[Dose]
    forma: Forma
    recipientes: list[Recipiente]
    acessorios: frozenset[str]
    kit: bool = False
    unidades_kit: list[int] = field(default_factory=list)
    fracionada: bool = False
    hospitalar: bool = False

    @property
    def primario(self) -> Recipiente | None:
        for r in self.recipientes:
            if not r.acessorio and r.tipo not in ("DISPLAY", "ESTOJO", "KIT"):
                return r
        return self.recipientes[0] if self.recipientes else None

    @property
    def volume(self) -> float | None:
        """Conteudo (ML ou G) do recipiente primario, quando escrito."""
        p = self.primario
        if p and p.conteudo:
            return p.conteudo
        for r in self.recipientes:
            if r.conteudo and r.conteudo_un in ("ML", "G") and not r.acessorio:
                return r.conteudo
        return None

    @property
    def volume_diluente(self) -> float | None:
        """Volume do diluente que acompanha o po (DIL AMP X 10 ML)."""
        if "DIL" not in self.acessorios:
            return None
        for r in self.recipientes:
            if r.acessorio and r.conteudo and r.conteudo_un == "ML":
                return r.conteudo
        m = re.search(r"\bDIL\b[^+]*?X\s*(" + NUM_RX + r")\s*ML\b", self.resto)
        return numero(m.group(1)) if m else None

    @property
    def apos_reconstituicao(self) -> list[Dose]:
        """'(40 MG/ML APOS REC)': concentracao final escrita na apresentacao."""
        out = []
        for m in re.finditer(r"(" + NUM_RX + r")\s*(MG|MCG|G|UI)\s*/\s*(" + NUM_RX + r")?\s*ML\s*(?:APOS|APOS A|DEPOIS DA)\s*REC", self.texto):
            d = _mk(numero(m.group(1)), m.group(2), numero(m.group(3)) if m.group(3) else None, "ML", m.group(0))
            if d:
                out.append(d)
        return out

    @property
    def volume_un(self) -> str | None:
        p = self.primario
        if p and p.conteudo:
            return p.conteudo_un
        for r in self.recipientes:
            if r.conteudo and r.conteudo_un in ("ML", "G") and not r.acessorio:
                return r.conteudo_un
        return None


def _int(s: str | None) -> int | None:
    if not s:
        return None
    v = numero(s)
    return int(round(v)) if v is not None else None


def recipientes(resto: str) -> tuple[list[Recipiente], bool, list[int]]:
    """'CT 2 BL AL PLAS X 15' -> [BLISTER qtd 2 unidades 15]. Le tambem + DIL, + APLIC..."""
    t = limpar(resto)
    t = re.sub(r"\(\s*EMB[^)]*\)", " ", t)
    t = re.sub(r"(?<=[A-Z/])X(?=\d)", " X ", t)  # "AL/ALX28"
    t = re.sub(r"\b(\d+) EST (?=FA|AMP|FR|SER)", r"\1 ", t)  # "CX 10 EST FA": estojo com 1 frasco cada
    t = re.sub(r"(\d)\s*([.,])\s*(\d)", r"\1\2\3", t)
    blocos = re.split(r"\s\+\s|\s\+(?=[A-Z0-9])|(?<=[A-Z0-9])\+\s", " " + t + " ")
    res: list[Recipiente] = []
    kit = False
    unidades_kit: list[int] = []
    # "X 14 + 14" e "X 2+2+4": unidades de kit
    mk = re.search(r"\bX\s*(\d+(?:\s*\+\s*\d+(?![\d.,]|\s*(?:MG|MCG|ML|G|L|UI)\b))+)(?!\s*(?:ML|G|MG|L)\b)", t)
    if mk:
        unidades_kit = [int(x) for x in re.findall(r"\d+", mk.group(1))]
        kit = True
    for bi, bloco in enumerate(blocos):
        b = bloco.strip()
        if not b:
            continue
        toks = b.split()
        n_caixa = None
        j = 0
        achou = False
        while j < len(toks):
            tk = toks[j]
            if tk in CAIXAS and j + 1 < len(toks) and re.fullmatch(r"\d+", toks[j + 1]):
                n_caixa = int(toks[j + 1])
                j += 2
                continue
            if re.fullmatch(r"\d+", tk) and j + 1 < len(toks) and toks[j + 1] in RECIPIENTES:
                n = int(tk)
                tipo = RECIPIENTES[toks[j + 1]]
                rec = Recipiente(tipo, n, acessorio=bi > 0)
                res.append(rec)
                achou = True
                j += 2
                continue
            if tk in ("ENV", "SACH") and any(x in ("BOLS", "BOLSA", "FR", "AMP", "FA", "SER") for x in toks[j + 1:j + 4]):
                j += 1  # envelope de protecao em volta da bolsa/frasco ("ENV AL BOLS PLAS")
                continue
            if tk in RECIPIENTES and tk not in ("CAN", "APLIC") or (tk in ("CAN", "APLIC") and bi == 0 and not achou):
                tipo = RECIPIENTES[tk]
                n = n_caixa if (n_caixa and not achou) else 1
                if j > 0 and toks[j - 1] == "X" and res:
                    n = 1  # "2 BL X SER": a seringa esta dentro do blister
                    rec = Recipiente(tipo, res[-1].qtd, acessorio=bi > 0)
                    res[-1].unidades = res[-1].unidades or 1
                    res.append(rec)
                else:
                    rec = Recipiente(tipo, n, acessorio=bi > 0)
                    res.append(rec)
                achou = True
                n_caixa = None
                j += 1
                continue
            j += 1
        # X n (unidades) / X n ML (conteudo) dentro do bloco, aplicados ao ultimo recipiente do bloco
        alvo = next((r for r in reversed(res) if r.acessorio == (bi > 0)), None)
        if alvo is None:
            continue
        for m in re.finditer(r"(?:\bX|\bC/)\s*(" + NUM_RX + r")(?:\s*(ML|L|G|MG|KG|DOSES?|ACIONAMENTOS?|ACION|LITROS?)\b)?", b):
            if m.group(2):
                u = m.group(2)
                v = numero(m.group(1))
                if v is None:
                    continue
                if u in ("L", "LITRO", "LITROS"):
                    v, u = v * 1000, "ML"
                elif u == "KG":
                    v, u = v * 1000, "G"
                elif u == "MG":
                    v, u = v / 1000, "G"
                elif u.startswith(("DOSE", "ACION")):
                    u = "DOSE"
                if alvo.conteudo is None:
                    alvo.conteudo, alvo.conteudo_un = v, u
            else:
                if mk and m.start() == mk.start():
                    continue
                n = _int(m.group(1))
                if n is not None and alvo.unidades is None:
                    alvo.unidades = n
        if alvo.conteudo is None:
            m = re.search(r"(?<![/\d.,])(" + NUM_RX + r")\s*(ML|L)\b(?!\s*/)", b)
            if m and numero(m.group(1)):
                v = numero(m.group(1))
                alvo.conteudo, alvo.conteudo_un = (v * 1000, "ML") if m.group(2) == "L" else (v, "ML")
    return res, kit, unidades_kit


def parse_apresentacao(apresentacao: object) -> Apresentacao:
    texto = limpar(apresentacao)
    pref, resto = separar_prefixo(texto)
    # KIT: "(30 MG CAP DURA + 500 MG COM REV ...)" ou "100 MG COM REV + 200 MG COM REV"
    formas_no_prefixo = re.findall(r"\b(COM|CAP|DRG|COMP)\b", pref)
    ds = doses(pref)
    f = forma(pref)
    if not pref.strip():
        # "CX 200 COMP REV", "FR 10 ML GOTAS": sem prefixo, le doses e forma do texto inteiro
        ds = doses(texto)
        f = forma(re.sub(r"\b(?:CT|CX|FR|EMB|BL|AMP|FA)\b", " ", texto))
    recs, kit, uk = recipientes(resto)
    if len(formas_no_prefixo) >= 2 and "+" in pref:
        kit = True
    partes = [x for x in re.split(r"\+", pref) if x.strip()]
    if len(partes) >= 2 and sum(1 for x in partes if re.search(r"\b(?:" + "|".join(FORMA_CMED) + r")\b", x)) >= 2:
        kit = True  # "(500 MG PO SOL INFUS + 9 MG/ML SOL INFUS)": po + diluente na mesma caixa
    # volume escrito no prefixo ("300 MG SOL DIL INFUS X 1,62 ML" nao; "SOL ORAL X TUBO X 2ML")
    return Apresentacao(
        texto=texto, prefixo=pref, resto=resto, doses=ds, forma=f, recipientes=recs,
        acessorios=acessorios(texto), kit=kit, unidades_kit=uk,
        fracionada="FRAC" in texto, hospitalar="HOSP" in texto,
    )


# ---------------------------------------------------------------------------
# Leituras de dose (R3): por unidade, concentracao e total por recipiente

def _arred(v: float) -> float:
    return float(f"{v:.6g}")


def leituras(d: Dose, ap: Apresentacao | None = None) -> set[tuple[str, float]]:
    """Conjunto de leituras comparaveis da dose: ('MG', 500), ('MG/ML', 50), ('MG/G', 20)..."""
    out: set[tuple[str, float]] = set()
    u = d.unidade
    if d.den == "DOSE":
        # "62,5 MCG/DOSE" e "0,5 MG/DOSE COM REV": a dose por acionamento tambem vale como dose solta
        out.add((f"{u}/DOSE", _arred(d.por_den)))
        out.add((u, _arred(d.por_den)))
        return out
    if d.den is None and ap is not None and (ap.forma.familia in ("INAL", "NASAL") or "DOSE" == (ap.volume_un or "")):
        out.add((f"{u}/DOSE", _arred(d.valor)))
    if u == "PCT":
        out.add(("MG/ML", _arred(d.valor * 10)))
        out.add(("MG/G", _arred(d.valor * 10)))
        out.add(("PCT", _arred(d.valor)))
        if ap is not None and ap.volume:
            out.add(("MG", _arred(d.valor * 10 * ap.volume)))
        return out
    if d.den is None:
        out.add((u, _arred(d.valor)))
        if ap is not None and ap.volume and ap.volume_un == "ML" and u in ("MG", "UI", "MEQ", "MMOL") and ap.forma.base in (
                "SOLUCAO", "SUSPENSAO", "EMULSAO", "PO", None):
            out.add((f"{u}/ML", _arred(d.valor / ap.volume)))
        if ap is not None and ap.forma.base == "PO":
            for x in ap.apos_reconstituicao:
                out.add((f"{x.unidade}/ML", _arred(x.por_den)))
        return out
    c = d.por_den
    if d.den in ("ML", "G"):
        out.add((f"{u}/{d.den}", _arred(c)))
        if d.den_valor != 1.0:
            out.add((u, _arred(d.valor)))  # "250 MG/5 ML" tambem como "250 MG" (dose por 5 mL)
        if u == "MG" and d.den == "ML":
            out.add(("PCT", _arred(c / 10)))
        if u == "MG" and d.den == "G":
            out.add(("PCT", _arred(c / 10)))
        if ap is not None and ap.volume and ap.volume_un == d.den:
            out.add((u, _arred(c * ap.volume)))
        if ap is not None and d.den == "ML" and ap.forma.base == "PO" and ap.volume_diluente:
            out.add((u, _arred(c * ap.volume_diluente)))  # po: concentracao x volume do diluente
        return out
    out.add((f"{u}/{d.den}", _arred(c)))
    return out


def iguais(a: float, b: float, tol: float = 0.02) -> bool:
    if a == b:
        return True
    m = max(abs(a), abs(b))
    return m > 0 and abs(a - b) / m <= tol
