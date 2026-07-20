import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Métricas da aba "Preços" — comparativo dos preços praticados em compras
// públicas de medicamentos (base ComprasGov, tabela sismat.ComprasGovPreco).
//
// Duas consultas servem a página inteira:
//   • overview — 1 groupBy por (material × unidade) alimenta o combobox de
//     seleção, os cards de resumo E o ranking de maior variação de preço.
//   • serie    — todas as compras de UM combo (medicamento × unidade), com
//     campos curtos (mesma semântica do dashboard de origem) para o gráfico
//     de dispersão. O agrupamento por esfera/modalidade e a ocultação de
//     outliers acontecem no cliente, sem novas idas ao servidor.
// ─────────────────────────────────────────────────────────────────────────────

export interface PrecosCombo {
  material: string;
  unidade: string;
  n: number; // nº de compras registradas
}

export interface PrecosTopVariacao {
  material: string;
  unidade: string;
  n: number;
  precoMin: number;
  precoMax: number;
  razao: number; // precoMax / precoMin
}

export interface PrecosOverviewData {
  totalRegistros: number;
  totalMedicamentos: number;
  dataMin: string | null; // "YYYY-MM-DD"
  dataMax: string | null;
  /** Combos (medicamento × unidade) em ordem alfabética — opções do combobox. */
  combos: PrecosCombo[];
  /** Top 15 por razão preço máx/mín (mínimo 5 compras registradas). */
  topVariacao: PrecosTopVariacao[];
  hasData: boolean;
}

/** Um ponto do gráfico — chaves curtas (mesma semântica da base de origem). */
export interface PrecoPonto {
  id: number;
  d: string; // data "YYYY-MM-DD"
  p: number; // preço unitário (R$)
  q: number; // quantidade
  v: number; // valor total (R$)
  e: string; // esfera
  c: string; // modalidade de compra
  j: string; // "Judicial" | "Não Judicial"
}

export interface PrecosSerieData {
  material: string;
  unidade: string;
  pontos: PrecoPonto[];
}

/** Nº mínimo de compras para um combo entrar no ranking de variação. */
export const MIN_COMPRAS_VARIACAO = 5;

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export async function getPrecosOverview(): Promise<PrecosOverviewData> {
  const grupos = await db.comprasGovPreco.groupBy({
    by: ["material", "unidade"],
    _count: { _all: true },
    _min: { precoUnitario: true, dtCompra: true },
    _max: { precoUnitario: true, dtCompra: true },
  });

  const combos: PrecosCombo[] = grupos
    .map((g) => ({ material: g.material, unidade: g.unidade, n: g._count._all }))
    .sort((a, b) =>
      a.material === b.material
        ? a.unidade.localeCompare(b.unidade, "pt-BR")
        : a.material.localeCompare(b.material, "pt-BR")
    );

  let totalRegistros = 0;
  let dataMin: Date | null = null;
  let dataMax: Date | null = null;
  const materiais = new Set<string>();

  for (const g of grupos) {
    totalRegistros += g._count._all;
    materiais.add(g.material);
    if (g._min.dtCompra && (!dataMin || g._min.dtCompra < dataMin)) dataMin = g._min.dtCompra;
    if (g._max.dtCompra && (!dataMax || g._max.dtCompra > dataMax)) dataMax = g._max.dtCompra;
  }

  const topVariacao: PrecosTopVariacao[] = grupos
    .filter((g) => g._count._all >= MIN_COMPRAS_VARIACAO)
    .map((g) => {
      const precoMin = g._min.precoUnitario == null ? 0 : Number(g._min.precoUnitario);
      const precoMax = g._max.precoUnitario == null ? 0 : Number(g._max.precoUnitario);
      return {
        material: g.material,
        unidade: g.unidade,
        n: g._count._all,
        precoMin,
        precoMax,
        razao: precoMin > 0 ? precoMax / precoMin : 0,
      };
    })
    .sort((a, b) => b.razao - a.razao)
    .slice(0, 15);

  return {
    totalRegistros,
    totalMedicamentos: materiais.size,
    dataMin: dataMin ? toISODate(dataMin) : null,
    dataMax: dataMax ? toISODate(dataMax) : null,
    combos,
    topVariacao,
    hasData: grupos.length > 0,
  };
}

export async function getPrecosSerie(material: string, unidade: string): Promise<PrecosSerieData> {
  // Igualdade exata: material/unidade vêm da seleção controlada (combobox),
  // cujos valores saem do próprio banco — não há texto livre aqui.
  const rows = await db.comprasGovPreco.findMany({
    where: { material, unidade },
    orderBy: { dtCompra: "asc" },
    select: {
      id: true,
      dtCompra: true,
      precoUnitario: true,
      quantidade: true,
      valorTotal: true,
      esfera: true,
      modalidade: true,
      judicial: true,
    },
  });

  const pontos: PrecoPonto[] = rows.map((r) => ({
    id: r.id,
    d: toISODate(r.dtCompra),
    p: Number(r.precoUnitario),
    q: r.quantidade,
    v: Number(r.valorTotal),
    e: r.esfera,
    c: r.modalidade,
    j: r.judicial,
  }));

  return { material, unidade, pontos };
}
