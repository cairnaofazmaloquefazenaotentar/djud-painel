"""
Visao normalizada de um registro (linha da GP + linha da lista mensal atual).

Usa os dois textos, o da GP (epoca da inclusao) e o da lista atual, e fica com o
que der o parse mais completo, registrando qual foi usado (secao 5.1, item 2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .leitura import LinhaGP, LinhaLista
from .normaliza import (Apresentacao, acessorios, assinatura, ingredientes, limpar, nome_base,
                        parse_apresentacao, sal_de)


@dataclass
class Registro:
    gp: LinhaGP
    lista: LinhaLista | None
    fonte_texto: str  # "GP" ou "lista"
    substancia: str
    apresentacao: str
    produto: str
    ingredientes: tuple[str, ...]
    bases: tuple[str, ...]
    ap: Apresentacao
    assinatura: str
    acessorios: frozenset[str]
    classe: str = ""
    tipo: str = ""
    n_componentes: int = 1
    substancia_incompleta: bool = False
    teste: bool = False  # produto de teste da ANVISA (R12)
    extras: dict = field(default_factory=dict)

    @property
    def registro(self) -> str:
        return self.gp.registro

    @property
    def raiz(self) -> str:
        return self.gp.registro[:9]

    @property
    def sais(self) -> tuple[str | None, ...]:
        return tuple(sal_de(i) for i in self.ingredientes)


def _completude(subst: str, ap_txt: str) -> tuple[int, int]:
    a = parse_apresentacao(ap_txt)
    return (len(a.doses) > 0) + (a.forma.base is not None) + (a.primario is not None) + bool(subst), len(ap_txt)


RX_TESTE = re.compile(r"MEDICAMENTO (?:PARA )?TESTE|PRODUTO (?:DE MEDICAMENTO PARA )?TESTE|VISA ESTADUAL SP TESTE"
                      r"|TESTE VENCTO|APRESENTACAO 01 02")


def montar(gp: LinhaGP, lista: LinhaLista | None = None) -> Registro:
    usa_lista = False
    if lista is not None:
        cg = _completude(gp.substancia, gp.apresentacao)
        cl = _completude(lista.substancia, lista.apresentacao)
        usa_lista = cl[0] > cg[0] or (not gp.apresentacao.strip() and lista.apresentacao)
    subst = lista.substancia if usa_lista else gp.substancia
    ap_txt = lista.apresentacao if usa_lista else gp.apresentacao
    prod = (lista.produto if usa_lista else gp.produto) or (lista.produto if lista else "")
    ings = ingredientes(subst)
    ap = parse_apresentacao(ap_txt)
    n = max(len(ings), 1)
    incompleta = False
    # SUBSTANCIA incompleta: a apresentacao tem mais componentes que a substancia (secao 3.3)
    nd = len(ap.doses)
    if not ap.kit and nd > len(ings) >= 1 and "+" in ap.prefixo:
        n = nd
        incompleta = True
    juntos = " ".join([limpar(subst), limpar(prod), limpar(gp.fabricante), limpar(ap_txt)])
    teste = bool(RX_TESTE.search(juntos)) or (gp.registro.startswith("9") and "TESTE" in juntos)
    return Registro(
        gp=gp, lista=lista, fonte_texto="lista" if usa_lista else "GP", substancia=subst, apresentacao=ap_txt,
        produto=prod, ingredientes=ings, bases=tuple(nome_base(i) for i in ings), ap=ap,
        assinatura=assinatura(subst, ap_txt), acessorios=acessorios(ap_txt),
        classe=lista.classe if lista else "", tipo=lista.tipo if lista else "",
        n_componentes=n, substancia_incompleta=incompleta, teste=teste,
    )
