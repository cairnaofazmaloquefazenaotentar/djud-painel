"""
Pacotes de evidencias (nivel C) e decisoes do agente (secao 5.5, itens 2-6).

  pacote()          um JSON por registro: dados CMED (GP + lista atual), parse, candidatos com a
                    descricao integral e as guardas de cada um, e os vinculos da GP para a mesma
                    substancia (as doses e formas ja usadas mostram o "estilo" do PDM).
  resumo_texto()    o mesmo pacote em texto curto, para o agente ler um por vez.
  ler_decisoes()    saida_catmat/decisoes_catmat.csv (registro;decisao;catmat;justificativa;regras;autor;data).
                    decisao: CATMAT (escolheu um), NAO_TEM (fim da escada R14) ou B (2-3 opcoes em catmat,
                    separadas por "|"). Decisao confirmada vira precedente na rodada seguinte.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .catalogo import Catalogo
from .normaliza import leituras
from .registro import Registro

CABECALHO_DECISOES = ["registro", "decisao", "catmat", "justificativa", "regras", "autor", "data"]


@dataclass
class Decisao:
    registro: str
    decisao: str  # CATMAT / NAO_TEM / B
    catmats: list[int]
    justificativa: str
    regras: str
    autor: str
    data: str


def ler_decisoes(caminho: Path) -> dict[str, Decisao]:
    if not caminho.exists():
        return {}
    out: dict[str, Decisao] = {}
    with caminho.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            reg = (row.get("registro") or "").strip()
            if not reg:
                continue
            cats = [int(x) for x in str(row.get("catmat") or "").replace(",", "|").split("|") if x.strip().isdigit()]
            out[reg] = Decisao(reg, (row.get("decisao") or "").strip().upper(), cats,
                               (row.get("justificativa") or "").strip(), (row.get("regras") or "").strip(),
                               (row.get("autor") or "").strip(), (row.get("data") or "").strip())
    return out


def gravar_decisoes(caminho: Path, decisoes: list[Decisao]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_DECISOES)
        for d in decisoes:
            w.writerow([d.registro, d.decisao, "|".join(str(c) for c in d.catmats), d.justificativa, d.regras, d.autor,
                        d.data])


def vinculos_da_substancia(r: Registro, vinculos_por_ing: dict, cat: Catalogo, limite: int = 25) -> list[dict]:
    cont: Counter = Counter()
    for ing in r.ingredientes:
        for c, n in vinculos_por_ing.get(ing, Counter()).items():
            cont[c] += n
    out = []
    for c, n in cont.most_common(limite):
        it = cat.get(c)
        out.append({"catmat": c, "n": n, "descricao": it.descricao.strip() if it else "?",
                    "situacao": it.situacao if it else None})
    return out


def pacote(r: Registro, cands: list, procurado: list[str], vinculos_sub: list[dict], precedente: str = "") -> dict:
    ap = r.ap
    return {
        "registro": r.registro,
        "n": r.gp.n,
        "linha_gp": r.gp.linha,
        "cmed_gp": {"substancia": r.gp.substancia, "produto": r.gp.produto, "apresentacao": r.gp.apresentacao,
                    "fabricante": r.gp.fabricante},
        "cmed_lista": None if r.lista is None else {
            "substancia": r.lista.substancia, "produto": r.lista.produto, "apresentacao": r.lista.apresentacao,
            "classe": r.lista.classe, "tipo": r.lista.tipo, "regime": r.lista.regime, "tarja": r.lista.tarja,
            "restricao_hospitalar": r.lista.restricao},
        "texto_usado": r.fonte_texto,
        "parse": {
            "ingredientes": list(r.ingredientes), "bases": list(r.bases), "n_componentes": r.n_componentes,
            "substancia_incompleta": r.substancia_incompleta,
            "doses": [str(d) for d in ap.doses], "leituras": [sorted(leituras(d, ap)) for d in ap.doses],
            "forma": ap.forma.resumo(), "familia": ap.forma.familia,
            "recipiente": ap.primario.tipo if ap.primario else None, "conteudo": ap.volume, "conteudo_un": ap.volume_un,
            "acessorios": sorted(r.acessorios), "kit": ap.kit,
        },
        "precedente": precedente,
        "candidatos": [{
            "catmat": c.item.codigo, "descricao": c.item.descricao.strip(), "situacao": c.item.situacao,
            "no_csv_11_07": c.item.descricao_extracao is None,
            "unidades_oficiais": [u.texto for u in c.item.unidades],
            "grau_r14": c.av.grau if c.av.aprovado else "essencial",
            "guardas": [str(g) for g in c.av.guardas], "notas": c.av.notas, "essenciais": c.av.essenciais,
            "achado_por": sorted(c.como),
        } for c in cands],
        "busca": procurado,
        "vinculos_gp_mesma_substancia": vinculos_sub,
    }


def resumo_texto(p: dict) -> str:
    """Pacote em poucas linhas, na ordem em que o agente precisa ler."""
    l = p["cmed_lista"] or {}
    linhas = [
        f"## {p['registro']} (nº {p['n']}, linha {p['linha_gp']})",
        f"SUBST: {p['cmed_gp']['substancia']}  |  PRODUTO: {p['cmed_gp']['produto']}  |  FAB: {p['cmed_gp']['fabricante']}",
        f"APRES (GP): {p['cmed_gp']['apresentacao']}",
    ]
    if l and l.get("apresentacao") != p["cmed_gp"]["apresentacao"]:
        linhas.append(f"APRES (lista): {l.get('apresentacao')}  | SUBST (lista): {l.get('substancia')}")
    if l:
        linhas.append(f"CLASSE: {l.get('classe')} | TIPO: {l.get('tipo')}")
    pa = p["parse"]
    linhas.append(f"PARSE: doses {pa['doses']} · forma {pa['forma']} ({pa['familia']}) · recip {pa['recipiente']} "
                  f"{pa['conteudo'] or ''}{pa['conteudo_un'] or ''} · acess {pa['acessorios']} · n={pa['n_componentes']}")
    if p.get("precedente"):
        linhas.append(f"PRECEDENTE: {p['precedente']}")
    if p["vinculos_gp_mesma_substancia"]:
        linhas.append("GP p/ substância: " + " · ".join(f"{v['catmat']}×{v['n']} {v['descricao'][:70]}"
                                                       for v in p["vinculos_gp_mesma_substancia"][:6]))
    for i, c in enumerate(p["candidatos"][:8], 1):
        rep = [g for g in c["guardas"] if "REPROVADA" in g]
        linhas.append(f"  {i}. {c['catmat']} [{c['situacao'] or '?'}|{c['grau_r14']}] {c['descricao'][:150]}"
                      f" | un: {', '.join(c['unidades_oficiais'][:4])}"
                      + (f" | REPROV: {'; '.join(rep)[:160]}" if rep else "")
                      + (f" | notas: {'; '.join(c['notas'])[:160]}" if c["notas"] else ""))
    if not p["candidatos"]:
        linhas.append("  (nenhum candidato) busca: " + ", ".join(p["busca"][:12]))
    return "\n".join(linhas)


def salvar_pacote(dir_: Path, p: dict) -> Path:
    dir_.mkdir(parents=True, exist_ok=True)
    caminho = dir_ / f"{p['registro']}.json"
    caminho.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
    return caminho
