"""Proposta de associacao para um registro (o que vai para a planilha de revisao)."""

from __future__ import annotations

from dataclasses import dataclass, field

from .guardas import Avaliacao
from .registro import Registro

NIVEIS = ("A", "B", "C", "D", "Fora")


@dataclass
class Opcao:
    catmat: int
    n: int = 0  # vinculos da GP que usam o CATMAT nesta chave
    raizes: int = 0
    grau: str = ""
    motivo: str = ""


@dataclass
class Proposta:
    registro: Registro
    nivel: str  # A / B / C / D / Fora
    catmat: int | None = None
    metodo: str = ""  # irmão / gêmeo / catálogo / adjudicação / R12
    aderencia: str = ""  # exato / equivalente / aproximado (R14)
    evidencia: str = ""
    alertas: list[str] = field(default_factory=list)
    opcoes: list[Opcao] = field(default_factory=list)
    avaliacao: Avaliacao | None = None
    unidade: str | None = None
    qt: int | None = None
    qt_alerta: str = ""
    precedente: str = ""
    candidatos: list = field(default_factory=list)  # (Item, Avaliacao) ordenados (nivel C/D)
    busca: list[str] = field(default_factory=list)  # o que foi procurado (nivel D)
    rascunho: str = ""  # pedido de CATMAT novo (nivel D)
    regras: list[str] = field(default_factory=list)

    def alerta(self, txt: str) -> None:
        if txt and txt not in self.alertas:
            self.alertas.append(txt)
