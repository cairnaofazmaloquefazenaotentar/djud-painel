"""
Validacao cruzada (secao 6 do prompt).

  backtest_precedente()  GroupKFold por RAIZ (5 dobras): nenhuma apresentacao do mesmo
                          produto fica no treino e no teste ao mesmo tempo. Cobertura e
                          acerto por nivel e por chave; lista TODOS os desacordos do nivel A.
  amostra_cega()         sorteio (semente fixa) para o backtest as cegas do catalogo (6.2).
"""

from __future__ import annotations

import hashlib
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .catalogo import Catalogo
from .pontes import aprender
from .precedente import IndicePrecedente
from .registro import Registro


def dobra(raiz: str, k: int = 5) -> int:
    return int(hashlib.md5(raiz.encode()).hexdigest(), 16) % k


@dataclass
class ResultadoBacktest:
    total: int = 0
    por_nivel: Counter = field(default_factory=Counter)
    acerto_nivel: Counter = field(default_factory=Counter)
    por_metodo: Counter = field(default_factory=Counter)
    acerto_metodo: Counter = field(default_factory=Counter)
    desacordos_a: list = field(default_factory=list)  # (registro, previsto, gp, metodo, evidencia)
    motivos_b: Counter = field(default_factory=Counter)

    def linhas(self) -> list[tuple]:
        out = []
        for nv in ("A", "B"):
            n = self.por_nivel[nv]
            if n:
                out.append((f"Nível {nv}", n, n / self.total, self.acerto_nivel[nv] / n))
        for m, n in sorted(self.por_metodo.items()):
            out.append((f"  {m}", n, n / self.total, self.acerto_metodo[m] / n))
        return out


def backtest_precedente(vinculos: list[tuple[Registro, int]], cat: Catalogo, decidir, unidade_de: dict, k: int = 5,
                        log=print) -> ResultadoBacktest:
    """decidir(r, prec, cat, P) -> Proposta (a mesma funcao usada na rodada real)."""
    res = ResultadoBacktest(total=len(vinculos))
    por_dobra: dict[int, list] = defaultdict(list)
    for r, c in vinculos:
        por_dobra[dobra(r.raiz, k)].append((r, c))
    for f in range(k):
        treino = [x for g, xs in por_dobra.items() if g != f for x in xs]
        teste = por_dobra[f]
        idx = IndicePrecedente(treino)
        P = aprender([(r, cat.get(c)) for r, c in treino if cat.get(c)], unidade_de)
        for r, c in teste:
            prec = idx.consultar(r)
            if prec.metodo == "nenhum":
                continue
            p = decidir(r, prec, cat, P)
            if p is None or p.catmat is None:
                continue
            res.por_nivel[p.nivel] += 1
            ok = p.catmat == c
            res.acerto_nivel[p.nivel] += ok
            chave = f"{p.nivel} · {prec.metodo}" + (" · unânime" if prec.unanime else " · não unânime")
            res.por_metodo[chave] += 1
            res.acerto_metodo[chave] += ok
            if p.nivel == "A" and not ok:
                res.desacordos_a.append((r, p.catmat, c, prec.metodo, prec.resumo()))
            if p.nivel == "B":
                res.motivos_b[p.evidencia.split(":")[0][:60]] += 1
        log(f"  dobra {f + 1}/{k}: treino {len(treino)}, teste {len(teste)}")
    return res


def amostra_cega(vinculos: list[tuple[Registro, int]], n_mono: int = 150, n_assoc: int = 50, max_registros: int = 3,
                 semente: int = 20261001) -> list[tuple[Registro, int]]:
    """150 vinculos de substancias com <= 3 registros + 50 de associacoes (semente fixa)."""
    por_subst: dict[tuple, list] = defaultdict(list)
    for r, c in vinculos:
        por_subst[r.ingredientes].append((r, c))
    raras = [x for s, xs in por_subst.items() if len(s) == 1 and len(xs) <= max_registros for x in xs]
    assoc = [x for s, xs in por_subst.items() if len(s) >= 2 for x in xs]
    rnd = random.Random(semente)
    rnd.shuffle(raras)
    rnd.shuffle(assoc)
    # uma por substancia, para nao repetir a mesma resposta
    def uma_por(xs, n):
        vistos, out = set(), []
        for r, c in xs:
            if r.ingredientes in vistos:
                continue
            vistos.add(r.ingredientes)
            out.append((r, c))
            if len(out) >= n:
                break
        return out
    return uma_por(raras, n_mono) + uma_por(assoc, n_assoc)


def backtest_irmao(vinculos: list[tuple[Registro, int]], cat: Catalogo, decidir, unidade_de: dict,
                   log=print) -> ResultadoBacktest:
    """Irmaos (mesma raiz) nao aparecem no GroupKFold por raiz, por construcao. Aqui: deixa-um-de-fora
    (o proprio registro sai do indice) e conta so as decisoes tomadas pela chave 'irmão'."""
    res = ResultadoBacktest(total=len(vinculos))
    idx = IndicePrecedente(vinculos)
    P = aprender([(r, cat.get(c)) for r, c in vinculos if cat.get(c)], unidade_de)
    for r, c in vinculos:
        prec = idx.consultar(r, excluir_registro=True)
        if prec.metodo != "irmão":
            continue
        p = decidir(r, prec, cat, P)
        if p is None or p.catmat is None:
            continue
        res.por_nivel[p.nivel] += 1
        ok = p.catmat == c
        res.acerto_nivel[p.nivel] += ok
        chave = f"{p.nivel} · irmão" + (" · unânime" if prec.unanime else " · não unânime")
        res.por_metodo[chave] += 1
        res.acerto_metodo[chave] += ok
        if p.nivel == "A" and not ok:
            res.desacordos_a.append((r, p.catmat, c, prec.metodo, prec.resumo()))
    log(f"  irmãos (deixa-um-de-fora): {sum(res.por_nivel.values())} decisões")
    return res


def backtest_cego(amostra: list[tuple[Registro, int]], vinculos: list[tuple[Registro, int]], cat: Catalogo,
                  gerar, log=print) -> list[tuple[Registro, int, list, list]]:
    """6.2: para cada vinculo sorteado, esconde o CATMAT, todo o precedente da mesma substancia e as
    pontes aprendidas dela (P reaprendido sem nenhum vinculo que compartilhe ingrediente/nome-base),
    e roda a geracao de candidatos as cegas. Devolve (registro, catmat GP, candidatos, procurado)."""
    from .normaliza import nome_base

    out = []
    for i, (r, c) in enumerate(amostra):
        bases = set(r.bases) | set(r.ingredientes)
        treino = [(x, cx) for x, cx in vinculos if not (set(x.bases) | set(x.ingredientes)) & bases]
        P = aprender([(x, cat.get(cx)) for x, cx in treino if cat.get(cx)])
        cands, procurado = gerar(r, cat, P)
        out.append((r, c, cands, procurado))
        if (i + 1) % 25 == 0:
            log(f"  às cegas: {i + 1}/{len(amostra)}")
    return out


def resumo_cego(res: list) -> dict:
    n = len(res)
    top1 = sum(1 for r, c, cs, _ in res if cs and cs[0].item.codigo == c)
    top3 = sum(1 for r, c, cs, _ in res if c in [x.item.codigo for x in cs[:3]])
    recall = sum(1 for r, c, cs, _ in res if c in [x.item.codigo for x in cs])
    return {"n": n, "top1": top1, "top3": top3, "recall10": recall}
