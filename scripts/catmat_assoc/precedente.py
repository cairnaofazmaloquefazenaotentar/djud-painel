"""
Precedente da GP: gemeos e irmaos (secao 5.3 do prompt).

Chaves, da mais especifica para a mais geral; para na primeira que tiver precedente:
  1. irmao   raiz | assinatura | acessorios (| volume, para liquidos/injetaveis)
  2. gemeo   assinatura | acessorios | volume  (liquidos e injetaveis)
  3. gemeo   assinatura | acessorios
  4. assin.  assinatura (falta conferir acessorios -> nunca A)

A assinatura usa o texto DA GP (o mesmo com que os vinculos foram feitos); o texto da
lista atual entra como segunda tentativa quando o da GP nao acha nada.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .normaliza import acessorios, assinatura
from .registro import Registro


def _vol(r: Registro) -> str | None:
    """Volume do recipiente primario, so para liquidos e injetaveis (dose do CATMAT pode depender dele)."""
    f = r.ap.forma
    if f.familia == "INJ" or f.base in ("SOLUCAO", "SUSPENSAO", "EMULSAO", "PO"):
        v = r.ap.volume
        if v:
            return f"{v:g}{r.ap.volume_un or ''}"
    return None


def chaves(r: Registro, usar_lista: bool = False) -> list[tuple[str, tuple]]:
    if usar_lista and r.lista is not None:
        sig = assinatura(r.lista.substancia, r.lista.apresentacao)
        ac = acessorios(r.lista.apresentacao)
    else:
        sig = assinatura(r.gp.substancia, r.gp.apresentacao)
        ac = acessorios(r.gp.apresentacao)
    v = _vol(r)
    ks: list[tuple[str, tuple]] = []
    if v:
        ks.append(("irmão", ("I", r.raiz, sig, ac, v)))
    ks.append(("irmão", ("I", r.raiz, sig, ac)))
    if v:
        ks.append(("gêmeo+volume", ("V", sig, ac, v)))
    ks.append(("gêmeo", ("G", sig, ac)))
    ks.append(("assinatura", ("S", sig)))
    return ks


@dataclass
class Precedente:
    metodo: str  # irmão / gêmeo+volume / gêmeo / assinatura / nenhum
    contagem: Counter = field(default_factory=Counter)  # CATMAT -> n vinculos
    raizes: dict[int, set] = field(default_factory=dict)  # CATMAT -> raizes distintas
    registros: dict[int, list] = field(default_factory=dict)  # CATMAT -> registros de exemplo
    texto: str = "GP"

    @property
    def unanime(self) -> bool:
        return len(self.contagem) == 1

    @property
    def top(self) -> int | None:
        return self.contagem.most_common(1)[0][0] if self.contagem else None

    @property
    def n_raizes_top(self) -> int:
        t = self.top
        return len(self.raizes.get(t, ())) if t else 0

    @property
    def maioria_2x(self) -> bool:
        mc = self.contagem.most_common(2)
        return len(mc) == 2 and mc[0][1] >= 2 * mc[1][1]

    def resumo(self) -> str:
        if not self.contagem:
            return "sem precedente"
        partes = [f"{c} ×{n} ({len(self.raizes.get(c, ()))} raiz{'es' if len(self.raizes.get(c, ())) != 1 else ''})"
                  for c, n in self.contagem.most_common(4)]
        return f"{self.metodo}: " + "; ".join(partes)


class IndicePrecedente:
    def __init__(self, vinculos: list[tuple[Registro, int]]):
        self.idx: dict[tuple, list[tuple[int, str, str]]] = defaultdict(list)
        for r, cat in vinculos:
            for _, k in chaves(r):
                self.idx[k].append((cat, r.raiz, r.registro))

    def consultar(self, r: Registro, excluir_registro: bool = True) -> Precedente:
        for usar_lista in (False, True):
            if usar_lista and (r.lista is None or (r.lista.apresentacao == r.gp.apresentacao and r.lista.substancia == r.gp.substancia)):
                break
            for metodo, k in chaves(r, usar_lista):
                vs = [x for x in self.idx.get(k, ()) if not (excluir_registro and x[2] == r.registro)]
                if not vs:
                    continue
                p = Precedente(metodo, texto="lista" if usar_lista else "GP")
                for cat, raiz, reg in vs:
                    p.contagem[cat] += 1
                    p.raizes.setdefault(cat, set()).add(raiz)
                    p.registros.setdefault(cat, []).append(reg)
                return p
        return Precedente("nenhum")


# ---------------------------------------------------------------------------
# Decisao pelo precedente (nivel A ou B)

def decidir(r: Registro, prec: Precedente, cat, P, min_raizes: int = 2):
    """Nivel A = CATMAT unanime E (irmao OU gemeos de >= min_raizes raizes) E Ativo E guardas ok."""
    from .guardas import avaliar
    from .proposta import Opcao, Proposta

    if prec.metodo == "nenhum" or not prec.contagem:
        return None
    top = prec.top
    it = cat.get(top)
    opcoes = [Opcao(c, n, len(prec.raizes.get(c, ()))) for c, n in prec.contagem.most_common()]
    p = Proposta(r, "B", catmat=top, metodo=prec.metodo.split("+")[0], opcoes=opcoes, precedente=prec.resumo())
    if it is None:
        p.evidencia = "precedente aponta para código fora do catálogo"
        return p
    av = avaliar(r, it, P, cat)
    p.avaliacao = av
    p.aderencia = av.grau if av.grau != "essencial" else ""
    motivos = []
    if not prec.unanime:
        motivos.append("maioria ≥ 2×" if prec.maioria_2x else "divergente")
    if prec.metodo == "assinatura":
        motivos.append("só a assinatura (acessórios não conferidos)")
    if not r.ap.prefixo.strip():
        motivos.append("apresentação sem dose/forma antes da embalagem (assinatura vazia)")
    if prec.metodo != "irmão" and prec.n_raizes_top < min_raizes:
        motivos.append(f"gêmeo de {prec.n_raizes_top} raiz")
    if not it.ativo:
        motivos.append("CATMAT inativo" if it.situacao == "Inativo" else "situação do CATMAT desconhecida")
    if not av.aprovado_a:
        motivos.append("guardas: " + "; ".join(str(g) for g in av.reprovadas()))
    if any("possível sal × base" in n for n in av.notas):
        motivos.append("dose só bate como sal × base sem razão aprendida (conferir massa molar)")
    if av.guarda("G1").ok is not True and "CATMAT inativo" not in motivos:
        motivos.append(str(av.guarda("G1")))
    p.regras = ["5.3"] + [f"G{i}" for i in range(1, 8)]
    if motivos:
        p.nivel = "B"
        p.evidencia = "; ".join(dict.fromkeys(motivos)) + f" | {prec.resumo()}"
    else:
        p.nivel = "A"
        p.evidencia = prec.resumo()
    for n in av.notas:
        if av.grau == "aproximado" or "aproxim" in n or "sem item" in n:
            p.alerta(n)
    return p
