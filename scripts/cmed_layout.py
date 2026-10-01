"""
Layout das listas mensais da CMED — ESPELHO de lib/cmed-aliquotas.ts.

ALIQUOTAS_ICMS define a POSICAO de cada aliquota nos arrays JSON "pf"/"pmvg"
gravados em public."CmedPrecoVersao" por scripts/import_cmed_mensal.py.
NUNCA reordenar nem remover: aliquota nova entra no FIM, aqui e no TS (o
autoteste abaixo compara as duas listas).

O hash da versao usa {codigo: valor} (e nao a posicao), entao acrescentar uma
aliquota no fim nao muda o hash das versoes ja gravadas. Arrays gravados antes
do acrescimo ficam mais curtos: posicao ausente = null.

Regras de leitura (dirigidas pelo cabecalho, nunca pela posicao da coluna):
  * colunas de preco: "PF 17%", "PF 17 %  ALC", "PMVG Sem Imposto(s)",
    "PF 20,5%2" (o "2" e nota de rodape do cabecalho);
  * valores: numero, "1383,38", "2504.84", "1.234,56", com ou sem nota de
    rodape ("3079.55*" = preco publicado com asterisco); "-"/vazio = null;
    "Liberado" = preco liberado (Res. CMED 5/2003), sem valor;
  * booleanos: Sim/S -> true, Nao/N -> false, resto -> null.

    python scripts/cmed_layout.py   # autoteste
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

ALIQUOTAS_ICMS: tuple[str, ...] = (
    "SEM_IMPOSTOS", "0", "12", "12_ALC", "17", "17_ALC", "17,5", "17,5_ALC", "18", "18_ALC",
    "19", "19_ALC", "19,5", "19,5_ALC", "20", "20_ALC", "20,5", "20,5_ALC", "21", "21_ALC",
    "22", "22_ALC", "22,5", "22,5_ALC", "23", "23_ALC",
)
INDICE_ALIQUOTA = {c: i for i, c in enumerate(ALIQUOTAS_ICMS)}

# Cabecalho normalizado (chave()) -> campo de CmedPrecoVersao. Ampliar conforme
# as listas de outras epocas; o que nao estiver aqui vai para "extras".
CAMPOS = {
    "PRINCIPIO ATIVO": "substancia",
    "SUBSTANCIA": "substancia",
    "CNPJ": "cnpj",
    "LABORATORIO": "laboratorio",
    "CODIGO GGREM": "codigoGgrem",
    "REGISTRO": "registro",
    "EAN": "ean1",
    "EAN 1": "ean1",
    "EAN 2": "ean2",
    "EAN 3": "ean3",
    "PRODUTO": "produto",
    "APRESENTACAO": "apresentacao",
    "CLASSE TERAPEUTICA": "classeTerapeutica",
    "RESTRICAO HOSPITALAR": "restricaoHospitalar",
    "CAP": "cap",
    "CONFAZ 87": "confaz87",
    "ICMS 0%": "icms0",
    "ANALISE RECURSAL": "analiseRecursal",
    "TARJA": "tarja",
    "REGIME DE PRECO": "regimePreco",
    "TIPO DE PRODUTO (STATUS DO PRODUTO)": "tipoProduto",
}
# Prefixos: "COMERCIALIZACAO 2018", "... 2025" (o ano muda a cada lista e fica
# registrado em CmedCompetencia.colunasOriginais); "ANALISE RECURSAL CMED /
# PRECO AJUSTADO POR DECISAO JUDICIAL" (mar/2021).
PREFIXOS = (
    ("COMERCIALIZACAO", "comercializacao"),
    ("ANALISE RECURSAL", "analiseRecursal"),
)
BOOLEANOS = ("restricaoHospitalar", "cap", "confaz87", "icms0")

# Colunas conscientemente mandadas para "extras", com chave curta. Coluna que
# nao estiver nem aqui nem em CAMPOS tambem vai para extras, com o cabecalho
# normalizado como chave, e aparece no relatorio do importador.
EXTRAS = {
    "LISTA DE CONCESSAO DE CREDITO TRIBUTARIO (PIS/COFINS)": "listaPisCofins",
    "DESTINACAO COMERCIAL": "destinacaoComercial",
}

VAZIOS = {"", "-", "--", "---", "—", "–"}

RE_PRECO = re.compile(
    r"^(PF|PMVG)\s*(?:(SEM IMPOSTOS?)|(\d+(?:[.,]\d+)?)\s*%\s*(\d{1,2})?)\s*(ALC)?$"
)
RE_VALOR = re.compile(r"^(?P<num>\d[\d.,]*)\s*(?P<nota>\*{1,3}|\(\d{1,2}\))?$")


class LayoutError(Exception):
    """Cabecalho que o importador nao sabe interpretar — aborta o arquivo."""


def sem_acentos(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if not unicodedata.combining(ch))


def chave(h) -> str:
    """Cabecalho comparavel: sem acento, maiusculas, espacos colapsados."""
    return re.sub(r"\s+", " ", sem_acentos(str(h if h is not None else "")).upper()).strip()


def codigo_taxa(taxa: str) -> str:
    """'17.5' -> '17,5'; '17,50' -> '17,5'; '12,0' -> '12'."""
    inteiro, _, dec = taxa.replace(".", ",").partition(",")
    dec = dec.rstrip("0")
    return f"{int(inteiro)},{dec}" if dec else str(int(inteiro))


def coluna_preco(cabecalho) -> tuple[str, str, str | None] | None:
    """Cabecalho de preco -> ("pf"|"pmvg", codigo de ALIQUOTAS_ICMS, nota).

    None se nao for coluna de preco. LayoutError se parecer de preco e nao for
    reconhecido, ou se a aliquota nao estiver em ALIQUOTAS_ICMS.
    """
    k = chave(cabecalho)
    if not re.match(r"^(PF|PMVG)\b", k):
        return None
    m = RE_PRECO.match(k)
    if not m:
        raise LayoutError(f"cabecalho de preco nao reconhecido: {cabecalho!r}")
    tipo = m.group(1).lower()
    if m.group(2):
        codigo = "SEM_IMPOSTOS"
    else:
        codigo = codigo_taxa(m.group(3)) + ("_ALC" if m.group(5) else "")
    if codigo not in INDICE_ALIQUOTA:
        raise LayoutError(
            f"aliquota {codigo!r} (coluna {cabecalho!r}) fora de ALIQUOTAS_ICMS: acrescente-a "
            "no FIM da lista em lib/cmed-aliquotas.ts e em scripts/cmed_layout.py"
        )
    return tipo, codigo, m.group(4)


def campo_da_coluna(cabecalho) -> tuple[str, str] | None:
    """Cabecalho nao-preco -> ("campo", nome) ou ("extra", chave). None se vazio."""
    k = chave(cabecalho)
    if not k:
        return None
    if k in CAMPOS:
        return "campo", CAMPOS[k]
    for prefixo, campo in PREFIXOS:
        if k.startswith(prefixo):
            return "campo", campo
    return "extra", EXTRAS.get(k, k)


def texto(v) -> str | None:
    """Texto com espacos colapsados; '-', travessao e vazio -> None."""
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r"\s+", " ", str(v)).strip()
    return None if s in VAZIOS else s


def booleano(v) -> tuple[bool | None, bool]:
    """(valor, reconhecido). Sim/S -> True, Nao/N -> False, vazio -> None."""
    k = chave(texto(v) or "")
    if k in ("SIM", "S"):
        return True, True
    if k in ("NAO", "N"):
        return False, True
    return None, k == ""


def _numero(s: str) -> tuple[float, bool] | None:
    """Texto numerico -> (valor, ambiguo). Ambiguo = 'd.ddd' (milhar ou decimal?)."""
    if re.fullmatch(r"\d+", s):
        return float(s), False
    if re.fullmatch(r"\d+,\d+", s):
        return float(s.replace(",", ".")), False
    if re.fullmatch(r"\d+\.\d+", s):
        return float(s), bool(re.fullmatch(r"\d{1,3}\.\d{3}", s))
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+,\d+", s):
        return float(s.replace(".", "").replace(",", ".")), False
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+\.\d+", s):
        return float(s.replace(",", "")), False
    if re.fullmatch(r"\d{1,3}(?:\.\d{3}){2,}", s):
        return float(s.replace(".", "")), False
    return None


def preco(v) -> tuple[float | None, str, str | None]:
    """Celula de preco -> (valor, estado, nota).

    estado: "ok" | "vazio" | "liberado" | "invalido" | "ambiguo".
    """
    if v is None:
        return None, "vazio", None
    if isinstance(v, bool):
        return None, "invalido", None
    if isinstance(v, (int, float)):
        if v != v or v < 0:  # NaN ou negativo
            return None, "invalido", None
        return round(float(v), 2), "ok", None
    s = re.sub(r"\s+", " ", str(v)).strip()
    if s in VAZIOS:
        return None, "vazio", None
    if chave(s) == "LIBERADO":
        return None, "liberado", None
    m = RE_VALOR.match(s)
    if not m:
        return None, "invalido", None
    num = _numero(m.group("num"))
    if num is None:
        return None, "invalido", None
    valor, ambiguo = num
    return round(valor, 2), ("ambiguo" if ambiguo else "ok"), m.group("nota")


def rotulo_aliquota(codigo: str) -> str:
    """'SEM_IMPOSTOS' -> 'Sem impostos'; '17,5_ALC' -> '17,5% ALC'; '0' -> '0%'."""
    if codigo == "SEM_IMPOSTOS":
        return "Sem impostos"
    taxa, _, alc = codigo.partition("_")
    return f"{taxa}% ALC" if alc else f"{taxa}%"


def aliquotas_do_ts(caminho: Path) -> list[str]:
    """Extrai ALIQUOTAS_ICMS de lib/cmed-aliquotas.ts (para o autoteste)."""
    fonte = caminho.read_text(encoding="utf-8")
    m = re.search(r"export const ALIQUOTAS_ICMS = \[(.*?)\] as const;", fonte, re.S)
    if not m:
        raise SystemExit(f"ERRO: ALIQUOTAS_ICMS nao encontrado em {caminho}")
    return re.findall(r'"([^"]+)"', m.group(1))


EXEMPLOS_CABECALHO = {
    "PF 17% ALC": ("pf", "17_ALC", None),
    "PF 17 % ALC": ("pf", "17_ALC", None),
    "PF 12 %  ALC": ("pf", "12_ALC", None),
    "PMVG Sem Impostos": ("pmvg", "SEM_IMPOSTOS", None),
    "PMVG Sem Imposto": ("pmvg", "SEM_IMPOSTOS", None),
    "PF 17,5%": ("pf", "17,5", None),
    "PMVG 0 %": ("pmvg", "0", None),
    "PF 20,5%2": ("pf", "20,5", "2"),
    "PRODUTO": None,
    "ICMS 0%": None,
}

EXEMPLOS_PRECO = {
    "1383,38": (1383.38, "ok", None),
    "2504.84": (2504.84, "ok", None),
    "1.234,56": (1234.56, "ok", None),
    "3079.55*": (3079.55, "ok", "*"),
    "7663,54*": (7663.54, "ok", "*"),
    "1.234": (1.23, "ambiguo", None),
    " - ": (None, "vazio", None),
    "": (None, "vazio", None),
    "Liberado": (None, "liberado", None),
    "abc": (None, "invalido", None),
    4760.294: (4760.29, "ok", None),
    21: (21.0, "ok", None),
    None: (None, "vazio", None),
}

if __name__ == "__main__":
    ok = True
    ts = aliquotas_do_ts(Path(__file__).resolve().parent.parent / "lib" / "cmed-aliquotas.ts")
    passou = tuple(ts) == ALIQUOTAS_ICMS
    ok = ok and passou
    print(f"  ALIQUOTAS_ICMS TS == Python ({len(ts)} codigos) {'OK' if passou else 'ERRO: listas diferentes'}")
    for cab, esperado in EXEMPLOS_CABECALHO.items():
        got = coluna_preco(cab)
        passou = got == esperado
        ok = ok and passou
        print(f"  cabecalho {cab!r:24} -> {got!r:36} {'OK' if passou else 'ERRO (esperado ' + repr(esperado) + ')'}")
    try:
        coluna_preco("PF 25%")
        ok = False
        print("  cabecalho 'PF 25%' deveria abortar (aliquota fora da lista) ERRO")
    except LayoutError:
        print("  cabecalho 'PF 25%' aborta (aliquota fora da lista)            OK")
    for val, esperado in EXEMPLOS_PRECO.items():
        got = preco(val)
        passou = got == esperado
        ok = ok and passou
        print(f"  preco {val!r:14} -> {got!r:32} {'OK' if passou else 'ERRO (esperado ' + repr(esperado) + ')'}")
    for cab, esperado in {
        "COMERCIALIZAÇÃO 2019": ("campo", "comercializacao"),
        "ANÁLISE RECURSAL CMED / PREÇO AJUSTADO POR DECISÃO JUDICIAL": ("campo", "analiseRecursal"),
        "SUBSTÂNCIA": ("campo", "substancia"),
        "LISTA DE CONCESSÃO DE CRÉDITO TRIBUTÁRIO (PIS/COFINS)": ("extra", "listaPisCofins"),
        "Coluna1": ("extra", "COLUNA1"),
    }.items():
        got = campo_da_coluna(cab)
        passou = got == esperado
        ok = ok and passou
        print(f"  coluna {cab[:40]!r:44} -> {got!r:34} {'OK' if passou else 'ERRO'}")
    for c, esperado in {"SEM_IMPOSTOS": "Sem impostos", "0": "0%", "17,5_ALC": "17,5% ALC"}.items():
        passou = rotulo_aliquota(c) == esperado
        ok = ok and passou
        print(f"  rotulo {c!r:14} -> {rotulo_aliquota(c)!r:16} {'OK' if passou else 'ERRO'}")
    raise SystemExit(0 if ok else 1)
