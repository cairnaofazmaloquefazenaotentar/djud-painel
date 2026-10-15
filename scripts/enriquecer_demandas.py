#!/usr/bin/env python3
"""
Enriquecimento das demandas (A5 da avaliacao da DLOG): medicamento, origem do
medicamento, apresentacoes e CATMATs derivados. Idempotente — rodar depois de
cada carga do Redmine (o importador e REPLACE: as colunas voltam vazias).

Medicamento (P5), nesta ordem:
  REDMINE    o "Princípio_Ativo" da demanda (como veio, itens "A | B");
  TITULO     substancias do dicionario citadas no titulo;
  DESCRICAO  substancias do dicionario citadas na descricao;
  SISMAT     o material das saidas do SISMAT com o mesmo NUP SEI.
  O dicionario e o CatmatItem (16 classes) + CmedRegistro.substancia, casados
  pelo radical (scripts/substancia.py, espelho de lib/substancia.ts). Texto
  que nao casa com o dicionario NAO vira medicamento.

Apresentacao (P6), nesta ordem (com as unidades de fornecimento de cada
CATMAT na CMED em "unidadesDerivadas", para o filtro de unidade):
  1. saidas do SISMAT (aquisicao) com o mesmo NUP SEI: o CATMAT do material
     ("BR0410020" -> 410020) e a descricao;
  2. concentracao citada no titulo/descricao ("50 mg") igual a de um CATMAT da
     mesma substancia ("CONCENTRAÇÃO: 50 MG");
  3. "nao identificada" (lista vazia).

Grava so o que mudou (UPDATE em lote; nao mexe em "atualizadoEm") e recalcula
"buscaNorm", que inclui o medicamento. O relatorio de cobertura sai na tela
e, com --relatorio, em CSV (as substancias derivadas do texto, para revisao).

Uso:
    python scripts/enriquecer_demandas.py --dry-run [--relatorio cobertura.csv]
    python scripts/enriquecer_demandas.py --confirm
    python scripts/enriquecer_demandas.py --autoteste
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from demandas_busca import montar_busca_norm, normalizar_nup_sei  # noqa: E402
from substancia import (  # noqa: E402
    TAMANHO_PARA_RADICAL,
    grupo_de_substancia,
    limpar_substancia,
    radical_palavra,
    sem_acento,
    substancia_principal,
)

# Classe do catalogo que entra no dicionario: so DROGAS E MEDICAMENTOS. As
# outras 15 classes da saude (luva, dreno, balanca, reagente...) dariam
# "medicamento" a partir de palavras comuns do titulo.
CLASSES_DICIONARIO = ("6505",)

# Palavras que o dicionario traz mas sao comuns no texto das demandas (nome
# generico, veiculo, forma). Comparadas pelo radical, como o texto. Revisar o
# relatorio de cobertura (--relatorio) a cada carga e acrescentar aqui.
PALAVRAS_GENERICAS = {
    "MEDICAMENTO", "MEDICAMENTOS", "DROGAS", "INJETAVEIS", "INJETAVEL", "FISIOLOGICA", "FISIOLOGICO",
    "SUPLEMENTO", "ALIMENTAR", "NUTRICIONAL", "COMPOSTO", "ASSOCIACAO", "EXTRATO", "VITAMINA",
    "VITAMINAS", "MINERAIS", "OLIGOELEMENTOS", "INSUMOS", "MATERIAL", "DIETETICO", "FORMULA",
    "INFANTIL", "PEDIATRICO", "ADULTO", "LIQUIDO", "SOLUCAO", "OFTALMICO", "OFTALMICA", "POMADA",
    "XAROPE", "SUSPENSAO", "COMPRIMIDO", "COMPRIMIDOS", "CAPSULA", "CAPSULAS", "AMPOLA", "PROTEINA",
    "AMINOACIDOS", "GLICOSE", "CLORETO", "BICARBONATO", "OXIGENIO", "NITROGENIO", "TRATAMENTO",
    "PACIENTE", "PROCEDIMENTO", "CIRURGICO", "HOSPITALAR", "FORNECIMENTO", "JUDICIAL",
}
RADICAIS_GENERICOS = {radical_palavra(p) for p in PALAVRAS_GENERICAS}

UNIDADES = r"MCG|MG|G|UI|U|ML|%|MEQ|MMOL"
RE_CONC = re.compile(
    r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(" + UNIDADES + r")\b(?:\s*/\s*(\d+(?:[.,]\d+)?)?\s*(ML|G|DOSE|L))?",
    re.IGNORECASE,
)
RE_CONC_CATMAT = re.compile(r"CONCENTRA[CÇ][AÃ]O:\s*([^,]+)", re.IGNORECASE)


def numero(txt: str) -> float:
    t = txt.replace(" ", "")
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", ".")
    return float(t)


def concentracoes(texto: str | None) -> set[str]:
    """Concentracoes citadas, normalizadas: "50 mg" -> "50 MG"; "10mg/ml" -> "10 MG/ML"."""
    saida: set[str] = set()
    for m in RE_CONC.finditer(sem_acento(str(texto or "")).upper()):
        try:
            v = numero(m.group(1))
        except ValueError:
            continue
        valor = f"{v:g}"
        unidade = m.group(2).upper()
        if m.group(4):
            base = f"{numero(m.group(3)):g} " if m.group(3) and numero(m.group(3)) != 1 else ""
            saida.add(f"{valor} {unidade}/{base}{m.group(4).upper()}")
        else:
            saida.add(f"{valor} {unidade}")
    return saida


def concentracao_do_catmat(descricao: str) -> set[str]:
    m = RE_CONC_CATMAT.search(descricao or "")
    return concentracoes(m.group(1)) if m else set()


def catmat_de_material(codigo: str | None) -> str | None:
    """Codigo do material no SISMAT -> CATMAT: "BR0410020" -> "410020"."""
    d = re.sub(r"\D", "", str(codigo or ""))
    return d.lstrip("0") or None if d else None


def palavras(texto: str | None) -> list[str]:
    return re.findall(r"[A-Z]+", sem_acento(str(texto or "")).upper())


class Dicionario:
    """radical -> nome exibido e CATMATs (com a concentracao) da substancia;
    CATMAT -> unidades de fornecimento (CMED, normalizadas)."""

    def __init__(self) -> None:
        self.nome: dict[str, str] = {}
        self.catmats: dict[str, list[tuple[str, set[str], str]]] = defaultdict(list)
        self.unidades: dict[str, set[str]] = defaultdict(set)

    def adicionar_nome(self, radical: str, nome: str) -> None:
        if radical not in RADICAIS_GENERICOS:
            self.nome.setdefault(radical, nome)

    def substancias_no_texto(self, texto: str | None) -> list[str]:
        """Radicais do dicionario citados no texto, na ordem em que aparecem."""
        achados: list[str] = []
        for p in palavras(texto):
            if len(p) < TAMANHO_PARA_RADICAL:
                continue
            r = radical_palavra(p)
            if r in self.nome and r not in achados:
                achados.append(r)
        return achados


def montar_dicionario(cur) -> Dicionario:
    d = Dicionario()
    grafias: dict[str, Counter] = defaultdict(Counter)
    # Grafia preferida = a mais usada no Redmine (a que o usuario reconhece).
    cur.execute('SELECT "principioAtivo", count(*) FROM public."Demanda" WHERE "principioAtivo" IS NOT NULL GROUP BY 1')
    for pa, n in cur.fetchall():
        for item in str(pa).split(" | "):
            g = grupo_de_substancia(item)
            if g and len(g["termos"]) == 1:
                grafias[g["termos"][0]][limpar_substancia(item)] += n
    cur.execute('SELECT "codigoItem", "descricaoItem" FROM public."CatmatItem" WHERE "codigoClasse" = ANY(%s)', (list(CLASSES_DICIONARIO),))
    for codigo, desc in cur.fetchall():
        g = grupo_de_substancia(substancia_principal(desc))
        if not g or len(g["termos"]) != 1:
            continue
        r = g["termos"][0]
        d.adicionar_nome(r, g["rotulo"].title())
        d.catmats[r].append((codigo, concentracao_do_catmat(desc), desc))
    cur.execute('SELECT catmat, "unidadeNorm" FROM public."CmedRegistro" WHERE catmat IS NOT NULL AND "unidadeNorm" IS NOT NULL')
    for catmat, unidade in cur.fetchall():
        d.unidades[str(catmat).lstrip("0")].add(unidade)
    cur.execute('SELECT DISTINCT substancia FROM public."CmedRegistro" WHERE substancia IS NOT NULL')
    for (sub,) in cur.fetchall():
        for parte in str(sub).split(";"):
            g = grupo_de_substancia(parte)
            if g and len(g["termos"]) == 1:
                d.adicionar_nome(g["termos"][0], g["rotulo"].title())
    for r, cont in grafias.items():
        if r in d.nome:
            d.nome[r] = cont.most_common(1)[0][0]
    return d


def saidas_por_nup(cur) -> dict[str, list[dict]]:
    """NUP SEI -> saidas de aquisicao do SISMAT (o NUP e o ultimo token do destinatario)."""
    cur.execute(
        'SELECT destinatario, "materialCodigo", material, "materialNome", "qtdEntregue", "dtBaixa" '
        'FROM sismat."SismatSaida" WHERE destinatario IS NOT NULL '
        "AND (\"progSaude\" IS NULL OR \"progSaude\" ILIKE '%aquisi%')"
    )
    por: dict[str, list[dict]] = defaultdict(list)
    for dest, cod, material, nome, qtd, dt in cur.fetchall():
        nup = normalizar_nup_sei(dest)
        if nup:
            por[nup].append({"catmat": catmat_de_material(cod), "material": material, "nome": nome, "qtd": qtd or 0, "dt": dt})
    return por


def enriquecer(d: dict, dic: Dicionario, sismat: dict[str, list[dict]]) -> dict:
    """Campos novos de uma demanda: medicamento, origem, apresentacoes e catmatsDerivados."""
    saidas = sismat.get(d["nupSei"] or "", [])
    radicais: list[str] = []
    if d["principioAtivo"]:
        medicamento, origem = d["principioAtivo"], "REDMINE"
        for item in d["principioAtivo"].split(" | "):
            g = grupo_de_substancia(item)
            radicais += g["termos"] if g else []
    else:
        medicamento, origem = None, None
        for campo, rotulo in (("titulo", "TITULO"), ("descricao", "DESCRICAO")):
            achados = dic.substancias_no_texto(d[campo])
            if achados:
                medicamento, origem, radicais = " | ".join(dic.nome[r] for r in achados), rotulo, achados
                break
        if not medicamento and saidas:
            nomes = sorted({s["nome"] or s["material"] for s in saidas if s["nome"] or s["material"]})
            if nomes:
                medicamento, origem = " | ".join(nomes), "SISMAT"

    apresentacoes: list[dict] = []
    por_catmat: dict[str, dict] = {}
    for s in saidas:
        if not s["catmat"]:
            continue
        a = por_catmat.setdefault(
            s["catmat"], {"catmat": s["catmat"], "descricao": s["material"], "origem": "SISMAT", "saidas": 0, "quantidade": 0.0, "ultimaSaida": None}
        )
        a["saidas"] += 1
        a["quantidade"] += float(s["qtd"] or 0)
        if s["dt"] and (a["ultimaSaida"] is None or s["dt"].isoformat()[:10] > a["ultimaSaida"]):
            a["ultimaSaida"] = s["dt"].isoformat()[:10]
    apresentacoes = sorted(por_catmat.values(), key=lambda a: a["catmat"])
    if not apresentacoes and radicais:
        citadas = concentracoes(f'{d["titulo"] or ""} {d["descricao"] or ""}')
        if citadas:
            for r in radicais:
                for codigo, conc, desc in dic.catmats.get(r, []):
                    if conc & citadas:
                        apresentacoes.append({"catmat": codigo, "descricao": desc, "origem": "TEXTO", "concentracao": sorted(conc & citadas)})
    catmats = sorted({a["catmat"] for a in apresentacoes})
    for a in apresentacoes:
        a["unidades"] = sorted(dic.unidades.get(a["catmat"], set()))
    return {
        "medicamento": medicamento,
        "medicamentoOrigem": origem,
        "apresentacoes": apresentacoes or None,
        "catmatsDerivados": catmats,
        "unidadesDerivadas": sorted({u for c in catmats for u in dic.unidades.get(c, set())}),
    }


# ------------------------------------------------------------------- autoteste

CASOS_CONC = [
    ("Eltrombopag 50 mg, 1 comprimido ao dia", {"50 MG"}),
    ("RITUXIMABE 10MG/ML frasco", {"10 MG/ML"}),
    ("insulina 100 UI/ML", {"100 UI/ML"}),
    ("dose de 1,5 mg", {"1.5 MG"}),
    ("sem concentracao", set()),
    ("processo 5000904-02.2021", set()),
]


def autoteste() -> int:
    erros = 0
    for texto, esperado in CASOS_CONC:
        r = concentracoes(texto)
        if r != esperado:
            erros += 1
            print(f"  ERRO concentracoes({texto!r}) = {r} != {esperado}")
    for desc, esperado in (("ELTROMBOPAG OLAMINA, CONCENTRAÇÃO: 50 MG", {"50 MG"}), ("MOMELOTINIBE, CONCENTRAÇÃO: 200 MG", {"200 MG"})):
        if concentracao_do_catmat(desc) != esperado:
            erros += 1
            print(f"  ERRO concentracao_do_catmat({desc!r})")
    for cod, esperado in (("BR0410020", "410020"), ("BR0006", "6"), (None, None)):
        if catmat_de_material(cod) != esperado:
            erros += 1
            print(f"  ERRO catmat_de_material({cod!r}) = {catmat_de_material(cod)!r}")
    total = len(CASOS_CONC) + 5
    print(f"enriquecer_demandas.py: {total - erros}/{total} caso(s) conferem")
    return 1 if erros else 0


# ------------------------------------------------------------------------ main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--dry-run", action="store_true")
    grupo.add_argument("--confirm", action="store_true")
    grupo.add_argument("--autoteste", action="store_true")
    ap.add_argument("--relatorio", type=Path, help="CSV com as substancias derivadas do texto (revisao)")
    args = ap.parse_args()
    if args.autoteste:
        return autoteste()
    if autoteste():
        return 1

    import psycopg
    from import_redmine_base import load_database_url

    t0 = time.time()
    with psycopg.connect(load_database_url()) as conn:
        with conn.cursor() as cur:
            dic = montar_dicionario(cur)
            sismat = saidas_por_nup(cur)
            print(f"dicionario: {len(dic.nome):,} substancias; SISMAT: {len(sismat):,} NUPs com saidas de aquisicao")
            cur.execute(
                'SELECT id, numero, "numeroProcesso", "nupSei", titulo, "principioAtivo", descricao, '
                'medicamento, "medicamentoOrigem", apresentacoes, "catmatsDerivados", "unidadesDerivadas" FROM public."Demanda"'
            )
            cols = [c.name for c in cur.description]
            linhas = [dict(zip(cols, r)) for r in cur.fetchall()]

        origem = Counter()
        apres = Counter()
        derivados_texto = Counter()
        mudancas = []
        for d in linhas:
            novo = enriquecer(d, dic, sismat)
            origem[novo["medicamentoOrigem"] or "(sem medicamento)"] += 1
            fonte = (novo["apresentacoes"] or [{"origem": "NAO_IDENTIFICADA"}])[0]["origem"]
            apres[fonte] += 1
            if novo["medicamentoOrigem"] in ("TITULO", "DESCRICAO"):
                derivados_texto[(novo["medicamentoOrigem"], novo["medicamento"])] += 1
            busca = montar_busca_norm({**d, "medicamento": novo["medicamento"]})
            atual = (d["medicamento"], d["medicamentoOrigem"], d["apresentacoes"], list(d["catmatsDerivados"] or []), list(d["unidadesDerivadas"] or []))
            if atual != (novo["medicamento"], novo["medicamentoOrigem"], novo["apresentacoes"], novo["catmatsDerivados"], novo["unidadesDerivadas"]):
                mudancas.append((d["id"], novo, busca))

        total = len(linhas) or 1
        print(f"\ndemandas: {len(linhas):,}")
        print("medicamento por origem:")
        for k, n in origem.most_common():
            print(f"  {k:<20} {n:>8,}  {100 * n / total:5.1f}%")
        print("apresentacao por origem:")
        for k, n in apres.most_common():
            print(f"  {k:<20} {n:>8,}  {100 * n / total:5.1f}%")
        print("substancias derivadas do texto (as 15 mais frequentes — revise):")
        for (o, m), n in derivados_texto.most_common(15):
            print(f"  {n:>6,}  {o:<9} {m}")
        if args.relatorio:
            with args.relatorio.open("w", newline="", encoding="utf-8-sig") as fh:
                w = csv.writer(fh, delimiter=";")
                w.writerow(["origem", "medicamento", "demandas"])
                for (o, m), n in derivados_texto.most_common():
                    w.writerow([o, m, n])
            print(f"relatorio: {args.relatorio}")
        print(f"\n{len(mudancas):,} demanda(s) a atualizar.")

        if args.dry_run:
            print("--dry-run: nada gravado.")
            return 0

        with conn.cursor() as cur:
            cur.execute(
                'CREATE TEMP TABLE _enr (id TEXT PRIMARY KEY, medicamento TEXT, "medicamentoOrigem" TEXT, '
                'apresentacoes JSONB, "catmatsDerivados" TEXT[], "unidadesDerivadas" TEXT[], "buscaNorm" TEXT) ON COMMIT DROP'
            )
            with cur.copy('COPY _enr FROM STDIN') as cp:
                for id_, n, busca in mudancas:
                    cp.write_row([
                        id_, n["medicamento"], n["medicamentoOrigem"],
                        json.dumps(n["apresentacoes"], ensure_ascii=False) if n["apresentacoes"] else None,
                        n["catmatsDerivados"], n["unidadesDerivadas"], busca,
                    ])
            cur.execute(
                'UPDATE public."Demanda" d SET medicamento = e.medicamento, "medicamentoOrigem" = e."medicamentoOrigem", '
                'apresentacoes = e.apresentacoes, "catmatsDerivados" = e."catmatsDerivados", '
                '"unidadesDerivadas" = e."unidadesDerivadas", "buscaNorm" = e."buscaNorm" '
                "FROM _enr e WHERE d.id = e.id"
            )
            print(f"{cur.rowcount:,} demanda(s) atualizada(s) em {time.time() - t0:.1f}s.")
        conn.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
