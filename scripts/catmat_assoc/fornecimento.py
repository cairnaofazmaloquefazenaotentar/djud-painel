"""
Unidade de fornecimento e Qt_Embal (secoes 3.9 e 5.6 do prompt).

  escolher_unidade()  sempre da lista OFICIAL do CATMAT (extracao de unidades): a que bate
                      com o recipiente e o conteudo do registro; empate -> a ja usada pela GP
                      para o mesmo CATMAT. Nenhuma compativel -> None + alerta (nivel B).
  qt_embalagem()      quantas unidades de fornecimento vem na embalagem, lida da apresentacao.
                      Armadilha conhecida: gramatura do blister ("PVDC 40 TRANS X 30" -> 30).
"""

from __future__ import annotations

from collections import Counter

from .normaliza import Apresentacao, limpar

# unidades contadas por dose (comprimido a comprimido); as demais contam recipientes
UNIDADES_POR_DOSE = {"COMPRIMIDO", "CAPSULA", "DRAGEA", "PASTILHA", "SUPOSITORIO", "OVULO", "ADESIVO", "TABLETE",
                     "GOMA", "EMPLASTRO", "UNIDADE", "FILME", "IMPLANTE", "ANEL", "DISPOSITIVO", "GRAMA", "MILILITRO",
                     "DOSE", "STRIP"}
# nome da unidade -> tipos de recipiente da apresentacao que ela conta
RECIPIENTE_DA_UNIDADE = {
    "FRASCO": ("FRASCO", "FRASCO-AMPOLA", "BOLSA", "FLACONETE", "POTE", "GALAO"),
    "FRASCO-AMPOLA": ("FRASCO-AMPOLA", "FRASCO", "AMPOLA"),
    "AMPOLA": ("AMPOLA", "FRASCO-AMPOLA", "FLACONETE"),
    "SERINGA": ("SERINGA", "CANETA", "CARPULE"),
    "CANETA": ("CANETA", "SERINGA", "CARPULE"),
    "BISNAGA": ("BISNAGA", "POTE", "FRASCO"),
    "TUBO": ("BISNAGA", "FRASCO"),
    "BOLSA": ("BOLSA", "FRASCO"),
    "ENVELOPE": ("ENVELOPE", "SACHE"),
    "SACHE": ("SACHE", "ENVELOPE"),
    "POTE": ("POTE", "FRASCO"),
    "GALAO": ("GALAO", "BOLSA", "FRASCO"),
    "BOMBONA": ("GALAO",),
    "TUBETE": ("CARPULE", "AMPOLA"),
    "CARPULE": ("CARPULE",),
    "CARTUCHO": ("CARPULE",),
    "FLACONETE": ("FLACONETE", "AMPOLA", "FRASCO"),
    "BLISTER": ("BLISTER", "STRIP"),
    "CILINDRO": ("CILINDRO",),
    "APLICADOR": ("APLICADOR",),
}


def nome_unidade(texto: str | None) -> str:
    t = limpar(texto)
    return t.split(" ")[0] if t else ""


def qt_embalagem(ap: Apresentacao, unidade: str | None) -> int | None:
    """Qt_Embal a partir da apresentacao, para a unidade de fornecimento escolhida."""
    un = nome_unidade(unidade)
    if not un:
        return None
    principais = [r for r in ap.recipientes if not r.acessorio and r.tipo not in ("DISPLAY", "ESTOJO", "KIT")]
    if un in UNIDADES_POR_DOSE or un == "":
        if ap.unidades_kit:
            base = principais[0].qtd if principais else 1
            return base * sum(ap.unidades_kit)
        if not principais:
            return None
        p = principais[0]
        if p.unidades:
            return p.qtd * p.unidades
        # "CT 2 BL X SER": unidades ficaram no recipiente interno
        if len(principais) > 1 and principais[1].unidades:
            return p.qtd * principais[1].unidades
        return p.qtd
    if un in ("CONJUNTO", "KIT", "EMBALAGEM"):
        return 1
    tipos = RECIPIENTE_DA_UNIDADE.get(un, (un,))
    for tipo in tipos:
        rs = [r for r in principais if r.tipo == tipo]
        if rs:
            return rs[-1].qtd if len(rs) > 1 and rs[0].tipo == "BLISTER" else rs[0].qtd
    for tipo in tipos:
        rs = [r for r in ap.recipientes if r.tipo == tipo]
        if rs:
            return rs[0].qtd
    return principais[0].qtd if principais else 1


PREFERENCIA_NOME = {
    "BLISTER": ("COMPRIMIDO", "CAPSULA"), "STRIP": ("COMPRIMIDO", "CAPSULA"), "FRASCO": ("FRASCO",),
    "FRASCO-AMPOLA": ("FRASCO-AMPOLA", "FRASCO"), "AMPOLA": ("AMPOLA",), "SERINGA": ("SERINGA",),
    "BISNAGA": ("BISNAGA",), "BOLSA": ("BOLSA",), "ENVELOPE": ("ENVELOPE", "SACHE"), "SACHE": ("SACHE", "ENVELOPE"),
    "CANETA": ("CANETA", "SERINGA"), "CARPULE": ("TUBETE", "CARPULE", "CARTUCHO"), "POTE": ("POTE",),
    "GALAO": ("GALAO", "BOMBONA"), "FLACONETE": ("FLACONETE",),
}


def escolher_unidade(compativeis: list, exatas: list, usadas_gp: Counter | None, ap: Apresentacao | None = None
                     ) -> tuple[str | None, str]:
    """(texto da unidade oficial, motivo). compativeis/exatas vem de guardas.unidades_compativeis.
    Ordem: conteudo igual > mesmo tipo de recipiente (DRAGEA quando o registro diz DRG) > ja usada na GP."""
    usadas_gp = usadas_gp or Counter()
    pref: tuple = ()
    if ap is not None:
        p = ap.primario
        pref = PREFERENCIA_NOME.get(p.tipo, ()) if p else ()
        if ap.forma.base == "COMPRIMIDO":
            pref = ("DRAGEA", "COMPRIMIDO") if "DRG" in ap.forma.mods else ("COMPRIMIDO", "DRAGEA")
        elif ap.forma.base == "CAPSULA":
            pref = ("CAPSULA",)

    def rank(u) -> tuple:
        n = nome_unidade(u.texto)
        return (pref.index(n) if n in pref else len(pref), -usadas_gp.get(u.texto, 0), u.texto)

    for grupo, motivo in ((exatas, "recipiente e conteúdo iguais"), (compativeis, "recipiente compatível")):
        if not grupo:
            continue
        if len(grupo) == 1:
            return grupo[0].texto, motivo
        ordenadas = sorted(grupo, key=rank)
        return ordenadas[0].texto, motivo + (" (desempate: a já usada na GP)" if usadas_gp.get(ordenadas[0].texto) else
                                             " (desempate: ordem alfabética)")
    return None, "nenhuma unidade oficial compatível com o recipiente/conteúdo"


def qt_alerta(qt: int | None, irmaos: list[int]) -> str:
    """Alerta quando o Qt destoa dos irmaos (mesma raiz) de forma suspeita."""
    if qt is None:
        return "Qt_Embal não lido da apresentação"
    if qt >= 1000:
        return f"Qt_Embal {qt} alto: conferir (gramatura do blister lida como quantidade?)"
    return ""
