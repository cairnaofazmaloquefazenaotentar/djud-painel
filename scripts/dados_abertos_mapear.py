#!/usr/bin/env python3
"""
Espelho Python de lib/dados-abertos/mapear.ts — item das APIs de dados abertos
(Compras.gov.br e BPS do Ministério da Saúde) ou linha da planilha do
Extrator-CATMAT-DA -> linha de public."DadosAbertosPreco".

Mudou uma regra no TS, mude aqui (e vice-versa). As duas implementações são
conferidas contra os mesmos casos:

    python scripts/dados_abertos_mapear.py --autoteste
    npx tsx scripts/conferir-mapear-dados-abertos.ts

Regras portadas do Extrator-CATMAT-DA: chave de 22 dígitos do item da compra,
idCompra com 16 ou 17 dígitos, unidade de fornecimento (nome ou sigla
traduzida + capacidade + medida, estas só com capacidade != 0), mapa de
modalidades e limpeza de descrição (limpar_descricao_bps = extracao_bps.sql).
Ids estáveis: COMPRASGOV:<chave22>, BPS:<sha1 do conteúdo canônico>,
ARP:<nº de controle da ata>:<nº do item>.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import date, datetime
from pathlib import Path

MAPA_MODALIDADE_DA = {
    "1": "Convite",
    "2": "Tomada de Preços",
    "3": "Concorrência",
    "4": "Concorrência Internacional",
    "5": "Pregão",
    "6": "Dispensa de Licitação",
    "7": "Inexigibilidade de Licitação",
    "20": "Concurso",
    "22": "Regime Diferenciado de Contratações",
    "99": "Não informado",
}

MAPA_CRITERIO_DA = {"V": "Menor preço", "1": "Menor preço", "0": "Não se aplica"}

SIGLA_UNIDADE = {
    "FR-AM": "Frasco-Ampola", "FR": "Frasco", "CAPS": "Cápsula",
    "COMPR": "Comprimido", "AM": "Ampola", "UN": "Unidade",
    "SER": "Seringa", "BIS": "Bisnaga", "BLIS": "Blister",
    "BOL": "Bolsa", "BOM": "Bombona", "CA": "Cartucho",
    "CI": "Curie", "CJ": "Conjunto", "DOSE(S)": "Dose(s)",
    "DOSES": "Dose(s)", "DRAG": "Drágea", "EMB": "Embalagem",
    "EMP": "Emplastro", "ENV": "Envelope", "FLAC": "Flaconete",
    "G": "Grama", "GL": "Galão", "GLOB": "Glóbulo",
    "KG": "Quilograma", "L": "Litro", "MCG": "Micrograma",
    "MCU": "Milicurie", "MG": "Miligrama",
    "MIL CTE": "Milheiro de Cartelas", "ML": "Mililitro",
    "PAST": "Pastilha", "POTE": "Pote", "RO": "Rolo",
    "SAC": "Sachê", "SUP": "Supositório", "TAB": "Tablete",
    "TBO": "Tubo", "TBTE": "Tubete", "UI": "Unid. Internacional",
}

# ── JSON da API ───────────────────────────────────────────────────────────────

def parse_json_seguro(texto: str):
    """O json do Python não perde dígitos; mantido pela simetria com o TS."""
    return json.loads(texto)


# ── Texto ─────────────────────────────────────────────────────────────────────

_CONTROLE = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001c-\u001e\u0085\u2028\u2029]")
_TAGS = re.compile(r"</?(div|span|p|br|b|i|strong|em)[^>]*>", re.IGNORECASE)
_ENTIDADES = (
    ("&#193;", "Á"), ("&#194;", "Â"), ("&#195;", "Ã"), ("&#199;", "Ç"),
    ("&#201;", "É"), ("&#202;", "Ê"), ("&#205;", "Í"), ("&#211;", "Ó"),
    ("&#212;", "Ô"), ("&#213;", "Õ"), ("&#218;", "Ú"), ("&#220;", "Ü"),
    ("&#225;", "á"), ("&#226;", "â"), ("&#227;", "ã"), ("&#231;", "ç"),
    ("&#233;", "é"), ("&#234;", "ê"), ("&#237;", "í"), ("&#243;", "ó"),
    ("&#244;", "ô"), ("&#245;", "õ"), ("&#250;", "ú"), ("&#252;", "ü"),
    ("&#186;", "º"), ("&#170;", "ª"),
)
_ESP = r"[ \t\n\r\f\v]"
_DOIS_PONTOS = re.compile(_ESP + r"*:" + _ESP + r"*")
_ESPACO_VIRGULA = re.compile(_ESP + r"+,")
_ESPACOS = re.compile(_ESP + r"+")


def _str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def limpar_controle(v) -> str:
    s = _str(v).replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    s = _CONTROLE.sub(" ", s)
    s = re.sub(r" {2,}", " ", s)
    return s.strip()


def limpar_descricao(v) -> str:
    s = limpar_controle(v)
    if not s:
        return ""
    s = _TAGS.sub("", s)
    for entidade, caractere in _ENTIDADES:
        s = s.replace(entidade, caractere)
    s = s.replace("¿", "°").replace("*", "")
    s = _DOIS_PONTOS.sub(": ", s)
    s = _ESPACO_VIRGULA.sub(",", s)
    s = _ESPACOS.sub(" ", s)
    return s.strip(" ")


def texto(v):
    s = limpar_controle(v)
    return s if s and s.lower() not in ("nan", "none", "null") else None


def numero(v):
    if v is None or v == "" or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    s = str(v).strip()
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        n = float(s)
    except ValueError:
        return None
    return n if math.isfinite(n) else None


def data_iso(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = _str(v).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"^(\d{2})[/-](\d{2})[/-](\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def codigo_catmat(v):
    s = re.sub(r"\.0+$", "", _str(v).strip())
    if not re.fullmatch(r"\d+", s):
        return None
    return s.lstrip("0") or "0"


def so_digitos(v):
    d = re.sub(r"\D", "", _str(v))
    return d or None


# ── Compra e item da compra ───────────────────────────────────────────────────

def normalizar_id_compra(v):
    s = re.sub(r"\.0+$", "", _str(v).strip())
    if not re.fullmatch(r"\d{16,17}", s):
        return None
    return s.zfill(17)


def chave_item22(id_compra, numero_item):
    ident = normalizar_id_compra(id_compra)
    item = re.sub(r"\.0+$", "", _str(numero_item).strip())
    if not ident or not re.fullmatch(r"\d{1,5}", item):
        return None
    return ident + item.zfill(5)


def partes_id_compra(id17: str) -> dict:
    return {"uasg": id17[0:6], "modalidade": id17[6:8], "numero": id17[8:13], "ano": id17[13:17]}


def numero_compra_do_id(id17: str) -> str:
    p = partes_id_compra(id17)
    return f"{p['numero']}/{p['ano']}"


def normalizar_uasg(v):
    s = re.sub(r"\.0+$", "", _str(v).strip())
    if not s:
        return None
    return s.zfill(6) if re.fullmatch(r"\d{1,6}", s) else s


def _capacidade_texto(n: float) -> str:
    return f"{n:.2f}".replace(".", ",")


def unidade_comprasgov(item: dict) -> str:
    nome = texto(item.get("nomeUnidadeFornecimento")) or ""
    sigla = texto(item.get("siglaUnidadeFornecimento")) or ""
    if not nome and sigla:
        nome = SIGLA_UNIDADE.get(sigla.upper(), sigla)
    cap_bruta = item.get("capacidadeUnidadeFornecimento")
    cap = numero(cap_bruta)
    medida = texto(item.get("siglaUnidadeMedida")) or ""
    partes = [nome] if nome else []
    if cap is not None and cap != 0:
        partes.append(cap_bruta.strip() if isinstance(cap_bruta, str) and cap_bruta.strip() else _capacidade_texto(cap))
        if medida:
            partes.append(medida)
    return " ".join(partes)


def nome_modalidade(codigo):
    c = re.sub(r"\.0+$", "", _str(codigo).strip())
    if not c:
        return None
    return MAPA_MODALIDADE_DA.get(c, f"Modalidade {c}")


def nome_criterio(codigo):
    c = _str(codigo).strip()
    if not c:
        return None
    return MAPA_CRITERIO_DA.get(c, f"código {c}")


# ── Linha de DadosAbertosPreco ────────────────────────────────────────────────

CAMPOS = [
    "id", "origem", "chaveOrigem", "chaveItemCompra22", "codigoCatmat", "codigoPdm", "descricao",
    "descricaoDetalhada", "unidade", "capacidade", "quantidade", "precoUnitario", "valorUnitarioEstimado",
    "dataCompra", "dataResultado", "dataInsercao", "idCompra", "numeroCompra", "numeroItemCompra",
    "modalidade", "criterioJulgamento", "forma", "situacao", "codigoUasg", "nomeUasg", "orgao", "cnpjOrgao",
    "esfera", "poder", "uf", "municipio", "niFornecedor", "nomeFornecedor", "marca", "cnpjFabricante",
    "nomeFabricante", "registroAnvisa", "generico", "processoCompra", "numeroAta", "validadeCompra",
    "observacoes", "numeroControlePncp", "numeroControlePncpAta", "origemCarga",
]


def id_estavel(origem: str, chave: str) -> str:
    prefixo = {"COMPRASGOV": "COMPRASGOV", "BPS": "BPS", "PNCP_ITEM": "PNCP", "ARP_ITEM": "ARP"}[origem]
    return f"{prefixo}:{chave}"


def _vazio(origem_carga: str) -> dict:
    linha = {c: None for c in CAMPOS}
    linha["origemCarga"] = origem_carga
    return linha


def _upper(v):
    return v.upper() if v else None


def mapear_comprasgov(item: dict, origem_carga: str) -> dict:
    pronta = _str(item.get("idCompraItem")).strip()
    chave = pronta if re.fullmatch(r"\d{22}", pronta) else chave_item22(item.get("idCompra"), item.get("numeroItemCompra"))
    if not chave:
        return {"ok": False, "erro": f"idCompra/numeroItemCompra inválidos: {item.get('idCompra')}/{item.get('numeroItemCompra')}"}
    id_compra = chave[:17]
    catmat = codigo_catmat(item.get("codigoItemCatalogo"))
    if not catmat:
        return {"ok": False, "erro": f"codigoItemCatalogo inválido: {item.get('codigoItemCatalogo')}"}
    preco = numero(item.get("precoUnitario"))
    if preco is None:
        return {"ok": False, "erro": f"precoUnitario inválido na compra {chave}"}
    partes = partes_id_compra(id_compra)
    modalidade = item.get("modalidade")
    linha = _vazio(origem_carga)
    linha.update({
        "id": id_estavel("COMPRASGOV", chave),
        "origem": "COMPRASGOV",
        "chaveOrigem": chave,
        "chaveItemCompra22": chave,
        "codigoCatmat": catmat,
        "codigoPdm": texto(item.get("codigoPdm")),
        "descricao": limpar_descricao(item.get("descricaoItem")) or "—",
        "descricaoDetalhada": limpar_descricao(item.get("descricaoDetalhadaItem")) or None,
        "unidade": unidade_comprasgov(item) or None,
        "capacidade": numero(item.get("capacidadeUnidadeFornecimento")),
        "quantidade": numero(item.get("quantidade")),
        "precoUnitario": preco,
        "dataCompra": data_iso(item.get("dataCompra")),
        "dataResultado": data_iso(item.get("dataResultado")),
        "idCompra": id_compra,
        "numeroCompra": numero_compra_do_id(id_compra),
        "numeroItemCompra": str(int(chave[17:])),
        "modalidade": nome_modalidade(modalidade if modalidade not in (None, "") else partes["modalidade"]),
        "criterioJulgamento": nome_criterio(item.get("criterioJulgamento")),
        "forma": texto(item.get("forma")),
        "codigoUasg": normalizar_uasg(item.get("codigoUasg")) or partes["uasg"],
        "nomeUasg": texto(item.get("nomeUasg")),
        "orgao": texto(item.get("nomeOrgao")),
        "esfera": texto(item.get("esfera")),
        "poder": texto(item.get("poder")),
        "uf": _upper(texto(item.get("estado"))),
        "municipio": texto(item.get("municipio")),
        "niFornecedor": so_digitos(item.get("niFornecedor")),
        "nomeFornecedor": texto(item.get("nomeFornecedor")),
        "marca": texto(item.get("marca")),
    })
    return {"ok": True, "linha": linha}


def chave_bps(item: dict) -> str:
    canonico = "|".join([
        codigo_catmat(item.get("codigoCatmat")) or "",
        so_digitos(item.get("cnpjInstituicao")) or "",
        data_iso(item.get("dataCompra")) or "",
        data_iso(item.get("dataInsercao")) or "",
        so_digitos(item.get("cnpjFornecedor")) or "",
        f"{numero(item.get('precoUnitario')) or 0:.4f}",
        f"{numero(item.get('quantidade')) or 0:.4f}",
        texto(item.get("numeroProcessoCompra")) or "",
    ])
    return hashlib.sha1(canonico.encode("utf-8")).hexdigest()


def _generico(v):
    if isinstance(v, bool):
        return v
    s = _str(v)
    if re.fullmatch(r"(?i)s|sim|true|1", s):
        return True
    if re.fullmatch(r"(?i)n|nao|não|false|0", s):
        return False
    return None


def mapear_bps(item: dict, origem_carga: str) -> dict:
    catmat = codigo_catmat(item.get("codigoCatmat"))
    if not catmat:
        return {"ok": False, "erro": f"codigoCatmat inválido: {item.get('codigoCatmat')}"}
    preco = numero(item.get("precoUnitario"))
    if preco is None:
        return {"ok": False, "erro": "precoUnitario inválido"}
    # A API entrega a capacidade multiplicada por 100 (25000.0 = 250,00).
    cap_bruta = numero(item.get("capacidade"))
    capacidade = None if cap_bruta is None else cap_bruta / 100
    base = texto(item.get("unidadeFornecimento")) or ""
    medida = texto(item.get("unidadeMedidaCapacidade")) or texto(item.get("siglaUnidadeMedida")) or ""
    if capacidade is not None and capacidade != 0 and base:
        unidade = f"{base} {_capacidade_texto(capacidade)}" + (f" {medida}" if medida and medida.upper() != base.upper() else "")
    else:
        unidade = base
    chave = chave_bps(item)
    linha = _vazio(origem_carga)
    linha.update({
        "id": id_estavel("BPS", chave),
        "origem": "BPS",
        "chaveOrigem": chave,
        "codigoCatmat": catmat,
        "codigoPdm": texto(item.get("codigoPdm")),
        "descricao": limpar_descricao(item.get("descricaoItem")) or "—",
        "unidade": unidade or None,
        "capacidade": capacidade,
        "quantidade": numero(item.get("quantidade")),
        "precoUnitario": preco,
        "dataCompra": data_iso(item.get("dataCompra")),
        "dataInsercao": data_iso(item.get("dataInsercao")),
        "modalidade": texto(item.get("modalidade")),
        "situacao": texto(item.get("tipoCompra")),
        "orgao": texto(item.get("nomeInstituicao")),
        "cnpjOrgao": so_digitos(item.get("cnpjInstituicao")),
        "esfera": texto(item.get("esfera")),
        "uf": _upper(texto(item.get("estado"))),
        "municipio": texto(item.get("municipio")),
        "niFornecedor": so_digitos(item.get("cnpjFornecedor")),
        "nomeFornecedor": texto(item.get("nomeFornecedor")),
        "cnpjFabricante": so_digitos(item.get("cnpjFabricante")),
        "nomeFabricante": texto(item.get("nomeFabricante")),
        "registroAnvisa": so_digitos(item.get("registroAnvisa")),
        "generico": _generico(item.get("generico")),
        "processoCompra": texto(item.get("numeroProcessoCompra")),
        "numeroAta": texto(item.get("numeroAta")),
        "validadeCompra": texto(item.get("validadeCompra")),
        "observacoes": texto(item.get("observacoes")),
    })
    return {"ok": True, "linha": linha}


def mapear_arp_item(item: dict, origem_carga: str) -> dict:
    ata = texto(item.get("numeroControlePncpAta"))
    if not ata:
        return {"ok": False, "erro": "item de ata sem nº de controle PNCP"}
    catmat = codigo_catmat(item.get("codigoItem"))
    if not catmat:
        return {"ok": False, "erro": f"codigoItem inválido: {item.get('codigoItem')}"}
    preco = numero(item.get("valorUnitario"))
    if preco is None:
        return {"ok": False, "erro": "valorUnitario inválido"}
    bruto_item = texto(item.get("numeroItem")) or ""
    numero_item = str(int(bruto_item)) if re.fullmatch(r"\d{1,5}", bruto_item) else None
    chave = f"{ata}:{numero_item}" if numero_item else f"{ata}:cat{catmat}:{so_digitos(item.get('niFornecedor')) or 'sem-fornecedor'}"
    id_compra = normalizar_id_compra(item.get("idCompra"))
    num, ano = texto(item.get("numeroCompra")), texto(item.get("anoCompra"))
    linha = _vazio(origem_carga)
    linha.update({
        "id": id_estavel("ARP_ITEM", chave),
        "origem": "ARP_ITEM",
        "chaveOrigem": chave,
        "chaveItemCompra22": chave_item22(id_compra, numero_item) if id_compra and numero_item else None,
        "codigoCatmat": catmat,
        "codigoPdm": texto(item.get("codigoPdm")),
        "descricao": limpar_descricao(item.get("descricaoItem")) or "—",
        "quantidade": numero(item.get("quantidadeHomologadaVencedor")) if numero(item.get("quantidadeHomologadaVencedor")) is not None else numero(item.get("quantidadeHomologadaItem")),
        "precoUnitario": preco,
        "dataCompra": data_iso(item.get("dataVigenciaInicial")) or data_iso(item.get("dataAssinatura")),
        "dataResultado": data_iso(item.get("dataAssinatura")),
        "idCompra": id_compra,
        "numeroCompra": f"{num}/{ano}" if num and ano else None,
        "numeroItemCompra": numero_item,
        "modalidade": texto(item.get("nomeModalidadeCompra")),
        "situacao": "Item excluído da ata" if item.get("itemExcluido") is True else None,
        "codigoUasg": normalizar_uasg(item.get("codigoUnidadeGerenciadora")),
        "nomeUasg": texto(item.get("nomeUnidadeGerenciadora")),
        "orgao": texto(item.get("nomeUnidadeGerenciadora")),
        "niFornecedor": so_digitos(item.get("niFornecedor")),
        "nomeFornecedor": texto(item.get("nomeRazaoSocialFornecedor")),
        "numeroAta": texto(item.get("numeroAtaRegistroPreco")),
        "validadeCompra": data_iso(item.get("dataVigenciaFinal")),
        "numeroControlePncp": texto(item.get("numeroControlePncpCompra")),
        "numeroControlePncpAta": ata,
    })
    return {"ok": True, "linha": linha}


# ── Autoteste ─────────────────────────────────────────────────────────────────

DIR_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "dados-abertos"

PLANILHA_EXTRATOR = [  # mesmas linhas de scripts/conferir-mapear-dados-abertos.ts
    {
        "idCompra": "9020105901632024", "numeroItemCompra": "6", "codigoItemCatalogo": "410020",
        "descricaoItem": "ELTROMBOPAG OLAMINA , CONCENTRAÇÃO:50 MG*", "nomeUnidadeFornecimento": "",
        "siglaUnidadeFornecimento": "COMPR", "capacidadeUnidadeFornecimento": "0,00", "siglaUnidadeMedida": "",
        "quantidade": "676.119,00", "precoUnitario": "233,92", "modalidade": "5", "criterioJulgamento": "V",
        "estado": "sp", "codigoUasg": "90201", "dataCompra": "10/01/2025",
    },
    {
        "idCompra": "12019505900412026", "numeroItemCompra": "122", "codigoItemCatalogo": "0410020",
        "descricaoItem": "<p>Solu&#231;&#227;o injet&#225;vel</p>   1¿C", "nomeUnidadeFornecimento": "Frasco",
        "siglaUnidadeFornecimento": "FR", "capacidadeUnidadeFornecimento": "100,00", "siglaUnidadeMedida": "ML",
        "quantidade": "10", "precoUnitario": "1.234,5", "modalidade": "77", "criterioJulgamento": "X",
        "dataCompra": "2026-08-13",
    },
]


def _casos() -> dict:
    ler = lambda nome: parse_json_seguro((DIR_FIXTURES / nome).read_text(encoding="utf-8"))
    cg = ler("comprasgov_1_consultarMaterial.json")["resultado"]
    bps = ler("bps_economia_da_saude.json")["bps"]
    arp = ler("arp_2_consultarARPItem.json")["resultado"]
    return {
        "funcoes": {
            "normalizarIdCompra": [[str(v), normalizar_id_compra(v)] for v in ["9020105901632024", "12019505900412026", "123", 12019505900412026]],
            "chaveItem22": [[f"{a}|{b}", chave_item22(a, b)] for a, b in [("9020105901632024", "6"), ("12019505900412026", "122"), ("12019505900412026", "123456")]],
            "numeroCompraDoId": [[v, numero_compra_do_id(v)] for v in ["12019505900412026", "09020105901632024", "98859905000292026"]],
            "limparDescricao": [[v, limpar_descricao(v)] for v in [
                "ELTROMBOPAG OLAMINA, CONCENTRAÇÃO:50 MG",
                "<div>Momelotinibe</div> ,  CONCENTRA&#199;&#195;O : 100 MG*",
                "Temperatura 2¿C a 8¿C\u000bcom\u2028quebra",
            ]],
            "unidadeComprasGov": [[json.dumps(v, ensure_ascii=False, separators=(",", ":")), unidade_comprasgov(v)] for v in [
                {"nomeUnidadeFornecimento": "COMPRIMIDO", "capacidadeUnidadeFornecimento": 0},
                {"nomeUnidadeFornecimento": "", "siglaUnidadeFornecimento": "FR-AM", "capacidadeUnidadeFornecimento": 10, "siglaUnidadeMedida": "ML"},
                {"siglaUnidadeFornecimento": "XYZ", "capacidadeUnidadeFornecimento": "0,00", "siglaUnidadeMedida": "ML"},
            ]],
        },
        "comprasgov": [mapear_comprasgov(i, "API_PAINEL") for i in cg],
        "planilhaExtrator": [mapear_comprasgov(i, "EXTRATOR") for i in PLANILHA_EXTRATOR],
        "bps": [mapear_bps(i, "API_PAINEL") for i in bps],
        "arp": [mapear_arp_item(i, "API_PAINEL") for i in arp],
    }


def _iguais(a, b, caminho="") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        if a.get("ok") is False and b.get("ok") is False:
            return []  # a mensagem de erro pode diferir; importa que os dois rejeitam
        dif = []
        for k in sorted(set(a) | set(b)):
            dif += _iguais(a.get(k), b.get(k), f"{caminho}.{k}")
        return dif
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{caminho}: {len(a)} ≠ {len(b)} elementos"]
        dif = []
        for i, (x, y) in enumerate(zip(a, b)):
            dif += _iguais(x, y, f"{caminho}[{i}]")
        return dif
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return [] if abs(a - b) < 1e-9 else [f"{caminho}: {a} ≠ {b}"]
    return [] if a == b else [f"{caminho}: {a!r} ≠ {b!r}"]


def autoteste() -> int:
    esperado = json.loads((DIR_FIXTURES / "esperado_mapear.json").read_text(encoding="utf-8"))
    diferencas = _iguais(_casos(), esperado)
    if diferencas:
        print(f"dados_abertos_mapear.py difere do esperado ({len(diferencas)}):")
        for d in diferencas[:30]:
            print("  ", d)
        return 1
    print("dados_abertos_mapear.py confere com esperado_mapear.json")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--autoteste", action="store_true", help="confere com scripts/fixtures/dados-abertos/esperado_mapear.json")
    args = ap.parse_args()
    if args.autoteste:
        sys.exit(autoteste())
    ap.print_help()
