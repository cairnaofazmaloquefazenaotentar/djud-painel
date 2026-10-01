"""
Parse do catalogo CATMAT (secao 3.5 do prompt).

Cada descricao segue "PDM, ROTULO: valor , ROTULO: valor ...", mas os rotulos sao
inconsistentes (FORMA FARMACEUTICA / FORMA FISICA / APRESENTACAO / INDICACAO: LOCAO /
USO: INJETAVEL / TIPO MEDICAMENTO: SUBLINGUAL). Por isso a forma, a via, a liberacao e
os acessorios sao lidos PELO SENTIDO do texto inteiro, nunca pelo rotulo.

  sem_rotulos(desc)  regra da coluna I da GP (", ROTULO: " -> ", ")
  Item               PDM, atributos, doses, forma, acessorios, nomes citados, flags
  Catalogo           itens + situacao/unidades (extracao) + indice por palavra
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .leitura import SituacaoCatmat, UnidadeOficial
from .normaliza import (Dose, Forma, doses, doses_compartilhando_denominador, familia_de, limpar,
                        nome_base)

_RE_ROTULO = re.compile(r",\s*([^,:]+?):\s*")


def sem_rotulos(descricao: str) -> str:
    """Descricao do catalogo sem os rotulos de atributo, no formato da coluna I da GP."""
    s = _RE_ROTULO.sub(", ", descricao)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+,", ",", s)
    s = re.sub(r",(?=\S)", ", ", s) if False else s
    return s.strip(" ,")


def atributos(descricao: str) -> tuple[str, list[tuple[str, str]]]:
    """('PDM', [(rotulo, valor), ...]) com texto limpo."""
    d = limpar(descricao)
    if "," not in d:
        return d.strip(), []
    pdm, resto = d.split(",", 1)
    partes = _RE_ROTULO.split("," + resto)
    attrs: list[tuple[str, str]] = []
    if partes and partes[0].strip(" ,"):
        attrs.append(("", partes[0].strip(" ,")))
    for i in range(1, len(partes) - 1, 2):
        attrs.append((partes[i].strip(" *").strip(), partes[i + 1].strip(" ,")))
    return pdm.strip(), attrs


# ---------------------------------------------------------------------------
# Vocabulario do catalogo (lido pelo sentido)

BASES_CAT = [
    (r"COMPRIMIDOS?|DRAGEAS?|TABLETES?", "COMPRIMIDO"),
    (r"CAPSULAS?", "CAPSULA"),
    (r"PO|POS", "PO"),
    (r"GRANULADO|GRANULOS", "GRANULADO"),
    (r"SOLUCAO|SOLUCOES|LIQUIDO", "SOLUCAO"),
    (r"SUSPENSAO", "SUSPENSAO"),
    (r"EMULSAO", "EMULSAO"),
    (r"XAROPE", "XAROPE"),
    (r"ELIXIR", "ELIXIR"),
    (r"CREME", "CREME"),
    (r"POMADA|UNGUENTO", "POMADA"),
    (r"GEL|GELEIA", "GEL"),
    (r"LOCAO", "LOCAO"),
    (r"PASTILHAS?", "PASTILHA"),
    (r"PASTA", "PASTA"),
    (r"ADESIVOS?|EMPLASTRO|SISTEMA TRANSDERMICO", "ADESIVO"),
    (r"SUPOSITORIOS?", "SUPOSITORIO"),
    (r"OVULOS?", "OVULO"),
    (r"AEROSSOL|AEROSOL", "AEROSSOL"),
    (r"SPRAY", "SPRAY"),
    (r"XAMPU|SHAMPOO", "XAMPU"),
    (r"COLUTORIO|ENXAGUATORIO", "COLUTORIO"),
    (r"IMPLANTE", "IMPLANTE"),
    (r"ESMALTE", "ESMALTE"),
    (r"OLEO", "OLEO"),
    (r"GOMA", "GOMA"),
    (r"TINTURA", "TINTURA"),
    (r"FILME|PELICULA", "FILME"),
    (r"ANEL", "ANEL"),
    (r"SABONETE", "SABONETE"),
    (r"ESPUMA", "ESPUMA"),
    (r"ENEMA", "SOLUCAO"),
    (r"COLIRIO", "SOLUCAO"),
    (r"GOTAS", "SOLUCAO"),
    (r"DISPOSITIVO INTRA-?UTERINO|SISTEMA INTRA-?UTERINO|DIU|SIU", "DIU"),
]
_RE_BASES = [(re.compile(r"(?<![A-Z])(?:" + p + r")(?![A-Z])"), b) for p, b in BASES_CAT]

VIAS_CAT = [
    (r"INJETAVE(?:L|IS)|INFUSAO|INTRAVENOS[OA]|INTRAMUSCULAR|SUBCUTANE[OA]|INTRA-?OCULAR|INTRAVITRE[OA]|INTRATECAL"
     r"|EPIDURAL|INTRA-?ARTICULAR|INTRADERMIC[OA]|INTRAVESICAL|PARENTERAL|ENDOVENOS[OA]", "INJ"),
    (r"ORAL|BUCAL|SUBLINGUAL|SUB-LINGUAL|ORODISPERSIVEL|MASTIGAVEL", "ORAL"),
    (r"OFTALMIC[OA]S?|COLIRIO|OCULAR", "OFT"),
    (r"NASAL|NASAIS|INTRANASAL", "NASAL"),
    (r"VAGINA(?:L|IS)", "VAG"),
    (r"RETAL|ENEMA", "RETAL"),
    (r"TOPIC[OA]|DERMATOLOGIC[OA]|DERMIC[OA]|CUTANE[OA]|CAPILAR|USO EXTERNO", "TOP"),
    (r"INALA(?:CAO|TORI[OA]|NTE|DOR)|NEBULIZACAO|INSPIRATORI[OA]", "INAL"),
    (r"TRANSDERMIC[OA]", "TRANSD"),
    (r"OTOLOGIC[OA]|AURICULAR|OTICO", "OTO"),
    (r"HEMODIALISE|DIALISE|HEMOFILTRACAO", "DIALISE"),
    (r"IRRIGACAO", "IRRIG"),
    (r"URETRAL", "URET"),
]
_RE_VIAS = [(re.compile(r"(?<![A-Z])(?:" + p + r")(?![A-Z])"), v) for p, v in VIAS_CAT]

LIB_CAT = [
    (r"LIBERACAO (?:PROLONGADA|CONTROLADA|LENTA|ESTENDIDA|SUSTENTADA|GRADUAL)|ACAO PROLONGADA|DESINTEGRACAO LENTA"
     r"|LONGA ACAO|RETARD(?![A-Z])", "PROL"),
    (r"LIBERACAO (?:ENTERICA|RETARDADA|TARDIA)|GASTRO-?RRESISTENTE|GASTRORESISTENTE|REVESTIMENTO ENTERICO"
     r"|ABSORCAO RETARDADA", "RETARD"),
    (r"LIBERACAO MODIFICADA|LIBERACAO BIFASICA|LIBERACAO IMEDIATA E PROLONGADA", "MOD"),
]
_RE_LIB = [(re.compile(p), v) for p, v in LIB_CAT]

MODS_CAT = [
    (r"ORODISPERSIVE(?:L|IS)", "ORODISP"), (r"SUB-?LINGUA(?:L|IS)", "SUBL"), (r"MASTIGAVE(?:L|IS)", "MAST"),
    (r"EFERVESCENTES?", "EFEV"), (r"(?<!ORO)DISPERSIVE(?:L|IS)", "DISP"), (r"GOTAS", "GOTAS"),
    (r"LIOFIL\w*|LIOFILO", "LIOF"), (r"DILUICAO", "DIL"), (r"MICROGRANULOS", "MICROGRAN"),
    (r"VAGINA(?:L|IS)", "VAG"), (r"BUCA(?:L|IS)", "BUCAL"),
]
_RE_MODS = [(re.compile(r"(?<![A-Z])" + p + r"(?![A-Z])"), v) for p, v in MODS_CAT]

ACESS_CAT = [
    (r"SERINGAS? PREENCHIDAS?|C/ SERINGA|COM SERINGA|EM SERINGA|SERINGA DESCARTAVEL|SERINGA", "SER"),
    (r"CANETAS?(?: APLICADORAS?| PREENCHIDAS?)?", "CAN"),
    (r"SISTEMA FECHADO", "SIST FECH"),
    (r"DILUENTE", "DIL"),
    (r"INALADOR|DISPOSITIVO INALATORIO|FRASCO INALADOR", "INAL"),
    (r"APLICADOR(?:ES)?|SISTEMA DE APLICACAO|CONJUNTO DE APLICACAO|CONJUNTO APLICADOR", "APLIC"),
    (r"BLISTER CALENDARIO|CALENDARIO", "CALEND"),
    (r"REFIL", "CAR"),
    (r"(?:COM|C/) EQUIPO|EQUIPO", "EQP"),
    (r"CAMARA (?:DUPLA|TRIPLA)|BOLSA DE CAMARA|BOLSA TRICAMERAL|BOLSA BICAMERAL", "CAMARAS"),
]
_RE_ACESS = [(re.compile(r"(?<![A-Z])(?:" + p + r")(?![A-Z])"), v) for p, v in ACESS_CAT]

FLAGS_CAT = [
    (r"FORMULA QUIMICA|PESO MOLECULAR|GRAU DE PUREZA|PUREZA MINIMA|TEOR DE PUREZA|SOLUBILIDADE"
     r"|MATERIA[ -]PRIMA|NUMERO DE REFERENCIA CAS|NUMERO CAS|PONTO DE FUSAO"
     r"|ASPECTO FISICO(?!\*?:\s*(?:BIDESTILADA|ESTERIL|SOLUCAO ESTERIL))", "insumo"),
    (r"VETERINARI[OA]", "veterinario"),
    (r"ESPECIALMENTE MANIPULADA|MANIPULAD[OA]|MANIPULACAO", "manipulado"),
    (r"REAGENTE|PADRAO ANALITICO|PADRAO DE REFERENCIA|PADRAO SECUNDARIO|PARA ANALISE|GRAU ANALITICO|P\.A\.", "reagente"),
]
_RE_FLAGS = [(re.compile(p), v) for p, v in FLAGS_CAT]

# Atributos que trazem nomes de outros principios ativos (associacao)
_RE_ASSOC = re.compile(
    r"(?:ASSOCIAD[OA]S?|ASSOC\.|COMBINAD[OA]S?|EM ASSOCIACAO|COM)\s*(?:COM|AO|AOS|A|AS|E|A\b)?\s+(.+)")


def _bases_no_texto(t: str) -> list[tuple[int, str]]:
    achados = []
    for rx, b in _RE_BASES:
        for m in rx.finditer(t):
            if b == "GEL" and re.match(r"GELATINOS", t[m.start():m.start() + 10]):
                continue
            achados.append((m.start(), b, m.end()))
    achados.sort()
    return [(p, b) for p, b, _ in achados]


ROTULO_COMPOSICAO = re.compile(r"COMPOS|PRINCIPIO|NOME|COMPONENTE|ORIGEM|ASSOC|INDICACAO DE USO|TIPO \d|TIPO$")


def forma_catalogo(texto: str, attrs: list[tuple[str, str]] | None = None) -> Forma:
    """Forma/via/liberacao/modificadores de uma descricao do catalogo (texto ja limpo, sem o PDM).
    A base vem dos atributos que nao sao de composicao ("COMPOSICAO: OLEO DE BORRAGEM" nao e forma)."""
    f = Forma()
    if attrs:
        sem_comp = " , ".join(v for r, v in attrs if not ROTULO_COMPOSICAO.search(r))
        bases = _bases_no_texto(sem_comp) or _bases_no_texto(texto)
    else:
        bases = _bases_no_texto(texto)
    for pos, b in bases:
        antes = texto[max(0, pos - 6):pos]
        if f.base is None:
            f.base = b
            continue
        if re.search(r"(?:P/|PARA|P/ )\s*$", antes) and f.base in ("PO", "GRANULADO", "COMPRIMIDO", "SOLUCAO"):
            if b in ("SOLUCAO", "SUSPENSAO", "EMULSAO"):
                f.para = f.para or b
            continue
        if b in ("AEROSSOL", "SPRAY"):
            f.mods.add(b)
            continue
        if f.base == "SOLUCAO" and b in ("GEL",):
            continue
    if f.base == "SOLUCAO" and re.search(r"(?<![A-Z])GOTAS(?![A-Z])", texto):
        f.mods.add("GOTAS")
    for rx, v in _RE_VIAS:
        if rx.search(texto):
            f.vias.add(v)
    if re.search(r"COLIRIO", texto):
        f.vias.add("OFT")
    for rx, v in _RE_LIB:
        if rx.search(texto):
            f.lib = v
            break
    for rx, v in _RE_MODS:
        if rx.search(texto):
            f.mods.add(v)
    if f.base == "PO" and "LIOF" in f.mods:
        f.vias.add("INJ") if not f.vias - {"INJ"} else None
    # "AEROSOL ORAL ... MCG/DOSE" e aerossol de inalacao oral, nao spray bucal
    if (f.base in ("AEROSSOL", "SPRAY") or f.mods & {"AEROSSOL", "SPRAY"} or f.base == "PO") and "ORAL" in f.vias and \
            re.search(r"MCG\s*/\s*(?:DOSE|JATO|ACION)|INALA|DOSIFICADORA|BOCAL", texto):
        f.vias.add("INAL")
    return f


@dataclass
class Item:
    codigo: int
    descricao: str  # texto oficial do CSV
    texto: str  # limpo (sem acento, maiusculas)
    pdm: str
    atributos: list[tuple[str, str]]
    doses: list[Dose]
    doses_alt: list[Dose]  # leitura com denominador compartilhado ("10 MG + 0,4 MG/G")
    doses_equiv: list[list[Dose]]  # "27 MG EQUIVALENTE A 13,3 MG/DIA": leituras alternativas
    forma: Forma
    acessorios: frozenset[str]
    flags: frozenset[str]
    n_componentes: int | None
    situacao: str | None = None  # Ativo / Inativo / None (ausente da extracao)
    unidades: list[UnidadeOficial] = field(default_factory=list)
    descricao_extracao: str | None = None  # so para itens que nao estao no CSV

    @property
    def ativo(self) -> bool:
        return self.situacao == "Ativo"

    @property
    def resto(self) -> str:
        return self.texto[len(self.pdm):]

    @property
    def sem_rotulos(self) -> str:
        return sem_rotulos(self.descricao)

    @property
    def familia(self) -> str:
        f = self.forma
        fam = familia_de(f.base, f.vias, f.mods)
        if fam == "?" and self.unidades:
            us = {limpar(u.unidade) for u in self.unidades}
            if us & {"COMPRIMIDO", "CAPSULA", "DRAGEA", "PASTILHA"}:
                return "ORAL"
        return fam

    def formas_pelas_unidades(self) -> set[str]:
        """Itens antigos sem forma escrita: COMPRIMIDO/CAPSULA vem da unidade de fornecimento."""
        out = set()
        for u in self.unidades:
            lu = limpar(u.unidade)
            if lu in ("COMPRIMIDO", "DRAGEA"):
                out.add("COMPRIMIDO")
            elif lu == "CAPSULA":
                out.add("CAPSULA")
        return out


def contar_componentes(pdm: str, attrs: list[tuple[str, str]], ds: list[Dose], vals: list[str] | None = None) -> int | None:
    """Quantos principios ativos o CATMAT descreve (None = nao da para saber).
    Doses so contam como componentes quando separadas por '+'."""
    n_doses = 0
    for v in vals or []:
        partes = [x for x in re.split(r"\+", v) if re.search(r"\d", x)]
        n_doses = max(n_doses, len(partes))
    assoc = 0
    for rot, val in attrs:
        m = re.search(r"(?:ASSOCIAD[OA]S?|ASSOC\.)\s+(?:COM|AO|AOS|A|AS|À|AS)?\s*(.+)", val)
        if m:
            nomes = re.split(r"\s+E\s+|,|\+|;", m.group(1))
            assoc = max(assoc, len([x for x in nomes if x.strip()]))
    if assoc:
        return 1 + assoc
    if "+" in pdm or " E " in pdm and pdm.startswith(("ASSOC",)):
        return None
    if n_doses >= 1:
        return n_doses
    return None


def montar_item(codigo: int, descricao: str) -> Item:
    texto = limpar(descricao)
    pdm, attrs = atributos(descricao)
    resto = texto[len(pdm):]
    vals = [v for r, v in attrs if re.search(r"\d", v) and not re.match(r"(?:FORMULA|PESO|NUMERO|VOLUME|TEOR ENERG)", r)]
    principal, equiv = [], []
    for v in vals:
        partes = re.split(r"\b(?:OU EQUIVALENTE A|EQUIVALENTE A|EQUIVALENTES A|EQUIVALE A|CORRESPONDENTE A|CORRESPONDE A|"
                          r"OU|COM)\b|\(|\)", v)
        principal.append(partes[0])
        equiv += [x for x in partes[1:] if x and re.search(r"\d", x)]
    ds = doses(" ; ".join(principal))
    alt = doses_compartilhando_denominador(ds)
    eq = [doses(x) for x in equiv]
    eq = [x for x in eq if x]
    f = forma_catalogo(resto, attrs)
    ac = frozenset(v for rx, v in _RE_ACESS if rx.search(resto))
    fl = set(v for rx, v in _RE_FLAGS if rx.search(texto))
    if any(r == "NOME" for r, _ in attrs) and not ds:
        fl.add("nome")
    return Item(codigo, descricao, texto, pdm, attrs, ds, alt, eq, f, ac, frozenset(fl),
                contar_componentes(pdm, attrs, ds, principal))


class Catalogo:
    """Catalogo + situacao/unidades da extracao + indice por palavra."""

    def __init__(self, descricoes: dict[int, str], situacoes: dict[int, SituacaoCatmat]):
        self.descricoes = descricoes
        self.situacoes = situacoes
        self.itens: dict[int, Item] = {}
        self.indice: dict[str, set[int]] = {}
        for cod, desc in descricoes.items():
            self._add(cod, desc, None)
        # criados depois de 11/07: so na extracao (descricao vem dela; sinalizar)
        self.so_extracao = {c for c in situacoes if c not in descricoes}
        for c in self.so_extracao:
            self._add(c, situacoes[c].descricao, situacoes[c].descricao)
        self.por_pdm: dict[str, list[int]] = {}
        for c, it in self.itens.items():
            self.por_pdm.setdefault(it.pdm, []).append(c)
        self._tri: dict[str, set[str]] | None = None

    @staticmethod
    def _trigramas(s: str) -> set[str]:
        s = f"  {s} "
        return {s[i:i + 3] for i in range(len(s) - 2)}

    def pdms_parecidos(self, nome: str, minimo: float = 0.82) -> list[tuple[str, float]]:
        """PDMs com grafia parecida (GONADOTROFINA ~ GONADOTROPINA, LOSARTAN ~ LOSARTANA)."""
        import difflib
        if self._tri is None:
            self._tri = {}
            self._base_pdm: dict[str, set[str]] = {}
            for pdm in self.por_pdm:
                if 4 <= len(pdm) <= 60:
                    for chave in {pdm, nome_base(pdm)}:
                        self._base_pdm.setdefault(chave, set()).add(pdm)
                        for t in self._trigramas(chave):
                            self._tri.setdefault(t, set()).add(chave)
        nome = limpar(nome)
        tg = self._trigramas(nome)
        cont: dict[str, int] = {}
        for t in tg:
            for pdm in self._tri.get(t, ()):
                cont[pdm] = cont.get(pdm, 0) + 1
        out = []
        for pdm, n in cont.items():
            if n < 0.5 * len(tg):
                continue
            r = difflib.SequenceMatcher(None, nome, pdm).ratio()
            if r >= minimo:
                for real in self._base_pdm.get(pdm, {pdm}):
                    out.append((real, r))
        return sorted(out, key=lambda x: -x[1])[:8]

    def _add(self, cod: int, desc: str, desc_ext: str | None) -> None:
        it = montar_item(cod, desc)
        s = self.situacoes.get(cod)
        if s:
            it.situacao = s.situacao
            it.unidades = s.unidades
        it.descricao_extracao = desc_ext
        self.itens[cod] = it
        for w in set(re.findall(r"[A-Z0-9][A-Z0-9-]{2,}", it.texto)):
            self.indice.setdefault(w, set()).add(cod)

    def __contains__(self, cod: int) -> bool:
        return cod in self.itens

    def get(self, cod: int) -> Item | None:
        return self.itens.get(cod)

    def no_csv(self, cod: int) -> bool:
        return cod in self.descricoes

    def buscar_nome(self, nome: str) -> set[int]:
        """Itens cujo texto contem o nome (todas as palavras, em sequencia)."""
        nome = limpar(nome)
        pal = [w for w in re.findall(r"[A-Z0-9][A-Z0-9-]{2,}", nome)]
        if not pal:
            return set()
        cands: set[int] | None = None
        for w in sorted(pal, key=lambda x: len(self.indice.get(x, ())))[:3]:
            s = self.indice.get(w, set())
            cands = set(s) if cands is None else cands & s
            if not cands:
                return set()
        rx = re.compile(r"(?<![A-Z0-9])" + re.escape(nome) + r"(?![A-Z0-9])")
        return {c for c in (cands or set()) if rx.search(self.itens[c].texto)}

    def buscar_prefixo(self, radical: str) -> set[int]:
        """Itens com alguma palavra que comeca pelo radical (minimo 5 letras)."""
        radical = limpar(radical)
        if len(radical) < 5:
            return set()
        out: set[int] = set()
        for w, s in self.indice.items():
            if w.startswith(radical):
                out |= s
        return out


def nomes_do_item(it: Item) -> set[str]:
    """Nomes de principio ativo citados no CATMAT: PDM, base do PDM e associados."""
    out = {it.pdm, nome_base(it.pdm)}
    for _, val in it.atributos:
        m = re.search(r"(?:ASSOCIAD[OA]S?|ASSOC\.)\s+(?:COM|AO|AOS|A|AS)?\s*(.+)", val)
        if m:
            for x in re.split(r"\s+E\s+|,|\+|;", m.group(1)):
                x = x.strip()
                if x:
                    out.add(x)
                    out.add(nome_base(x))
    return {x for x in out if x}
