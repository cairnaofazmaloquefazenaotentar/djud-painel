"""
Candidatos do catalogo (secao 5.5, item 1) e escada de aproximacao R14.

Recall primeiro: itens cujo PDM ou atributo contenha algum ingrediente (pelo nome inteiro,
pelo nome-base, pela ponte aprendida da GP, por sinonimo DCB/INN, pelo radical) ou um PDM de
categoria. Depois cada candidato passa pelas guardas e ganha o grau da R14. A ordem segue a
R10: (1) aprovado nas guardas; (2) grau R14 menor; (3) Ativo e sem flag; (4) mais especifico;
(5) mais usado pela GP para a mesma substancia (precedente fraco); (6) codigo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .catalogo import Catalogo, Item
from .guardas import GRAUS, Avaliacao, avaliar, radical
from .normaliza import limpar, nome_base
from .pontes import Pontes, eh_categoria
from .registro import Registro

# Sinonimos DCB/INN e PDMs de categoria por palavra do ingrediente (secao 3.3). Fonte: DCB/prompt.
CATEGORIA_POR_PALAVRA = [
    (r"VACINA", "VACINA"),
    (r"\b(?:GADOTER|GADOBUTROL|GADOXET|GADOPENTET|IOBITRIDOL|IOEXOL|IODIXANOL|IOVERSOL|IOPAMIDOL|IOMEPROL|IOPROMIDA|"
     r"GADOPICLENOL|GADOBENAT)", "CONTRASTE RADIOLOGICO"),
    (r"FATOR (?:VIII|IX|VII|XIII|XI|X)\b|OCTOCOG|NONACOG|EFTRENONACOG|EFMOROCTOCOG|TUROCTOCOG|SIMOCTOCOG|DAMOCTOCOG|"
     r"RURIOCTOCOG|LONOCTOCOG|ALBUTREPENONACOG|COMPLEXO PROTROMBINICO", "CONCENTRADO DE FATOR"),
    (r"SACCHAROMYCES|LACTOBACILLUS|BIFIDOBACTERIUM|BACILLUS CLAUSII|ENTEROCOCCUS", "PROBIOTICO"),
    (r"IMUNOGLOBULINA", "IMUNOGLOBULINA"),
    (r"INTERFERONA|ALFAPEGINTERFERONA|BETAINTERFERONA|ALFAINTERFERONA", "INTERFERONA"),
    (r"INSULINA", "INSULINA"),
    (r"FOLITROPINA|UROFOLITROPINA|ALFAFOLITROPINA|BETAFOLITROPINA|DELTAFOLITROPINA", "FOLITROPINA"),
    (r"OLEO DE SOJA|TRIGLICERIDEOS|OLEO DE PEIXE|OLEO DE OLIVA|ACIDOS GRAXOS OMEGA", "EMULSAO DE LIPIDIOS"),
    (r"MECOBALAMINA|CIANOCOBALAMINA|HIDROXOCOBALAMINA", "VITAMINA B12"),
    (r"AGUA PARA INJE", "AGUA DESTILADA"),
    (r"IMUNOGLOBULINA HETEROLOGA|SORO ANTI|ANTIVENENO|ANTIVEN|ANTITOXINA", "SORO"),
    (r"\b(?:HAEMOPHILUS|MENINGOCOCIC|PNEUMOCOCIC|ROTAVIRUS|PAPILOMAVIRUS|POLIOMIELITE|SARAMPO|FEBRE AMARELA|DENGUE|"
     r"CHIKUNGUNYA|VARICELA|HERPES ZOSTER|BCG|PERTUSSIS|DIFTERIA)", "VACINA"),
    (r"\b(?:LEUCINA|ISOLEUCINA|VALINA|LEVOVALINA|LISINA|METIONINA|LEVOMETIONINA|TREONINA|TRIPTOFANO|FENILALANINA|"
     r"HISTIDINA|ARGININA|ALANINA|GLICINA|PROLINA|SERINA|TIROSINA|TAURINA|CISTEINA|ACIDO ASPARTICO|ACIDO GLUTAMICO|"
     r"ALFAOXO|CETOANALOGO)", "AMINOACIDOS"),
    (r"OLEO DE SOJA|TRIGLICERIDEOS|OLEO DE PEIXE|OLEO DE OLIVA", "NUTRICAO PARENTERAL"),
    (r"SOLUCAO (?:PARA )?(?:HEMO)?DIALISE|DIALISE PERITONEAL", "SOLUCAO PARA DIALISE"),
    (r"\b(?:GINKGO|HEDERA|AESCULUS|PASSIFLORA|VALERIANA|SENNA|CASSIA|GLYCINE MAX|HYPERICUM|CIMICIFUGA|HARPAGOPHYTUM|"
     r"MIKANIA|SILYBUM|MATRICARIA|PANAX|ECHINACEA|CYNARA|CURCUMA|PELARGONIUM|PLANTAGO|MAYTENUS|ALPINIA|UNCARIA|"
     r"PIPER|MELISSA|ALLIUM|ZINGIBER|CENTELLA|VITIS|ARNICA|CALENDULA|MENTHA|EUCALYPTUS|SERENOA|PYGEUM|TRIBULUS)\b",
     "EXTRATO MEDICINAL"),
]

GENERICAS_TOKEN = {
    "COM", "PARA", "SEM", "DOS", "DAS", "TIPO", "GRUPO", "HUMANA", "HUMANO", "SOLUCAO", "INJETAVEL", "ORAL", "USO",
    "FORMA", "FARMACEUTICA", "CONCENTRACAO", "COMPOSICAO", "ASSOCIADO", "ASSOCIADA", "DOSAGEM", "APRESENTACAO",
    "CARACTERISTICA", "CARACTERISTICAS", "ADICIONAL", "ADICIONAIS", "OUTROS", "COMPONENTES", "ATIVO", "PRINCIPIO",
    "VACINA", "SORO", "EXTRATO", "SECO", "PADRONIZADO", "CONTENDO", "MEDICINAL", "FITOTERAPICO", "LIOFILO",
}


def palavras(t: str) -> set[str]:
    return {w for w in re.findall(r"[A-Z]{4,}", limpar(t)) if w not in GENERICAS_TOKEN}


def cobertura(r: Registro, it: Item) -> float:
    """Pontos de semelhanca textual: palavras do registro (substancia + produto) achadas no item,
    menos as palavras de componente do item que o registro nao tem (vacina DTP x tetano)."""
    reg = palavras(" ".join(r.ingredientes))
    if not reg:
        return 0.0
    txt = it.texto
    achou = sum(1 for w in reg if re.search(r"(?<![A-Z])" + re.escape(w[:max(5, len(w) - 2)]), txt))
    extra = 0.0
    if eh_categoria(it.pdm):
        comp = palavras(" ".join(v for rot, v in it.atributos if re.search(r"COMPOS|COMPONENTE|TIPO|PRINCIPIO|FATOR", rot)))
        extra = sum(1 for w in comp if not any(x.startswith(w[:5]) or w.startswith(x[:5]) for x in reg))
    return achou / len(reg) - 0.25 * extra


@dataclass
class Candidato:
    item: Item
    av: Avaliacao
    como: set[str] = field(default_factory=set)  # por qual nome foi achado
    uso: int = 0  # vinculos da GP que ja usam este CATMAT (R10.1, desempate)

    @property
    def chave_ordem(self) -> tuple:
        it, av = self.item, self.av
        espec = sum(1 for g in av.guardas if g.ok is True) + (2 if av.guarda("G3").ok else 0) \
            + (1 if it.forma.base else 0) + (1 if it.forma.lib else 0) + len(it.acessorios)
        dose_ok = av.guarda("G3").ok is True
        return (not av.aprovado, not it.ativo, bool(set(it.flags) - {"nome"}), GRAUS.index(av.grau), not dose_ok,
                -round(av.pontos, 2), -espec, -self.uso, -it.codigo)


def nomes_de_busca(r: Registro, P: Pontes) -> dict[str, set[str]]:
    """ingrediente -> nomes a procurar no catalogo."""
    out: dict[str, set[str]] = {}
    for ing in r.ingredientes:
        ns = set(P.nomes(ing))
        b = nome_base(ing)
        # sem o sufixo de cation ("ANLODIPINO" de "BESILATO DE ANLODIPINO" ja vem do nome_base)
        for rx, cat in CATEGORIA_POR_PALAVRA:
            if re.search(rx, limpar(ing)):
                ns.add(cat)
        # palavras longas do nome-base (para ingredientes compostos: "SILYBUM MARIANUM (L.) GAERTN")
        pal = [w for w in re.findall(r"[A-Z]{6,}", b)]
        if len(pal) >= 2:
            ns.add(" ".join(pal[:2]))
        out[ing] = {n for n in ns if len(n) >= 4}
    if r.substancia_incompleta:
        # SUBSTANCIA incompleta: procura tambem pelo nome do produto (secao 3.3)
        out["__produto__"] = {limpar(r.produto)} if r.produto else set()
    return out


def buscar(r: Registro, cat: Catalogo, P: Pontes) -> tuple[dict[int, set[str]], list[str]]:
    """codigo -> nomes que o acharam; e a lista do que foi procurado (documenta a busca do nivel D)."""
    achados: dict[int, set[str]] = {}
    procurado: list[str] = []
    por_ing: dict[str, set[int]] = {}
    for ing, nomes in nomes_de_busca(r, P).items():
        hits: set[int] = set()
        for n in sorted(nomes):
            if ing == "__produto__":
                continue
            h = cat.buscar_nome(n)
            if eh_categoria(n):
                h = {c for c in h if cat.itens[c].pdm.startswith(n)}
            procurado.append(f"{n} ({len(h)})")
            for c in h:
                achados.setdefault(c, set()).add(n)
            hits |= h
        if ing != "__produto__":
            base = nome_base(ing)
            rad = radical(base)
            if rad:
                h = cat.buscar_prefixo(rad)
                procurado.append(f"radical {rad}* ({len(h)})")
                for c in h:
                    achados.setdefault(c, set()).add(f"radical {rad}")
                hits |= h
            for pdm, sim in cat.pdms_parecidos(base):
                h = set(cat.por_pdm.get(pdm, ()))
                procurado.append(f"PDM parecido {pdm} ({sim:.2f}, {len(h)})")
                for c in h:
                    achados.setdefault(c, set()).add(f"PDM parecido {pdm}")
                hits |= h
            if not hits:
                # palavras longas do ingrediente ("... METACRILATO DE NICOTINA" -> NICOTINA)
                for w in sorted(palavras(base), key=len, reverse=True)[:4]:
                    if len(w) < 6:
                        continue
                    h = cat.buscar_nome(w)
                    procurado.append(f"palavra {w} ({len(h)})")
                    for c in h:
                        achados.setdefault(c, set()).add(f"palavra {w}")
                    hits |= h
        por_ing[ing] = hits
    # associacoes: prioriza itens que citam todos os ingredientes
    ings = [i for i in por_ing if i != "__produto__"]
    if len(ings) >= 2:
        todos = set.intersection(*(por_ing[i] for i in ings)) if all(por_ing[i] for i in ings) else set()
        if todos:
            achados = {c: v for c, v in achados.items() if c in todos or len(v) >= 2}
    return achados, procurado


NAO_MEDICAMENTO = re.compile(
    r"^(?:CEPA|MEIO DE CULTURA|MATERIAL |COSMETICO|ANTIBIOGRAMA|PADRAO |FIO |HEMOSTATICO|PROTEINA|ANTICORPO|"
    r"INSUMOS? FARMACEUTICO|SUPLEMENTO|OLEO ESSENCIAL|REPELENTE|REAGENTE|KIT |CORANTE|CONJUNTO|TESTE|"
    r"SOLUCAO USO MEDICO|ALIMENTO|FORMULA|DIETA|ESPESSANTE|LUVA|SERINGA|AGULHA|CURATIVO|ACESSORIO)")


def gerar(r: Registro, cat: Catalogo, P: Pontes, limite: int = 10, so_ativos: bool = False,
          excluir: set[int] | None = None) -> tuple[list[Candidato], list[str]]:
    achados, procurado = buscar(r, cat, P)
    cands: list[Candidato] = []
    for c, como in achados.items():
        if excluir and c in excluir:
            continue
        it = cat.itens[c]
        if so_ativos and not it.ativo:
            continue
        if set(it.flags) & {"veterinario", "reagente"}:
            continue
        if not it.ativo and ("nome" in it.flags or not it.doses):
            continue  # item antigo so com NOME:, sem dose: ruido do catalogo
        if NAO_MEDICAMENTO.match(it.pdm) and not P.pdms_usados.get(it.pdm):
            continue
        if "insumo" in it.flags and not it.doses:
            continue
        av = avaliar(r, it, P, cat)
        av.pontos = cobertura(r, it)
        cands.append(Candidato(it, av, como, P.uso_catmat.get(c, 0)))
    cands.sort(key=lambda x: x.chave_ordem)
    return cands[:limite], procurado


def grau_r14(c: Candidato) -> str:
    """exato / equivalente / aproximado / essencial (R14), considerando as guardas reprovadas."""
    if not c.av.aprovado:
        return "essencial"
    return c.av.grau
