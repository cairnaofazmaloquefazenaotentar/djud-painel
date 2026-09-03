import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Métricas do dashboard de Gastos SISMAT (Fornecedores e Fabricantes)
//
// Recorte de "gastos": apenas movimentações de aquisição
// (ENTRADA ORÇAMENTÁRIA + EXTRA-ORÇ. / AQUISIÇÃO). Devoluções, doações,
// reposições, bonificações e transferências têm valor mas NÃO são gasto —
// ficam de fora. Esse recorte reproduz exatamente o total do dashboard
// original (R$ 10.014.536.181,11). A série temporal usa Dt. Recebimento.
// ─────────────────────────────────────────────────────────────────────────────

export const SISMAT_DIMENSOES = ["fornecedor", "fabricante", "distribuidor", "material"] as const;
export type SismatDimensao = (typeof SISMAT_DIMENSOES)[number];

export const SISMAT_PERIODOS = ["monthly", "yearly"] as const;
export type SismatPeriodo = (typeof SISMAT_PERIODOS)[number];

/** Movimentações contadas como gasto (aquisição). */
export const TIPOS_AQUISICAO = ["ENTRADA ORÇAMENTÁRIA", "EXTRA-ORÇ. / AQUISIÇÃO"] as const;

/** Rótulos legíveis por dimensão (singular). */
export const SISMAT_DIM_LABELS: Record<SismatDimensao, string> = {
  fornecedor: "Fornecedor",
  fabricante: "Fabricante",
  distribuidor: "Distribuidor",
  material: "Material",
};

export interface SismatSeriesPoint {
  period: string; // "YYYY-MM" (mensal) ou "YYYY" (anual)
  key: string; // nome da entidade (fornecedor/fabricante/…)
  valor: number;
}
export interface SismatTotalPoint {
  period: string;
  valor: number;
}

export interface SismatMetricsData {
  dimension: SismatDimensao;
  period: SismatPeriodo;
  /** Valor por (período × entidade) — base para evolução, ranking e pizza. */
  series: SismatSeriesPoint[];
  /** Valor total por período (todas as aquisições) — linha "Total geral". */
  totalsByPeriod: SismatTotalPoint[];
  /** Anos distintos presentes (para o filtro de ano). */
  years: number[];
  /** Soma de todas as aquisições (independe da dimensão). */
  grandTotal: number;
  /** Há alguma linha de aquisição no banco? */
  hasData: boolean;
}

// Mapeia a dimensão para o campo correspondente no modelo Prisma.
const DIM_FIELD: Record<SismatDimensao, "fornecedor" | "fabricante" | "distribuidor" | "materialNome"> = {
  fornecedor: "fornecedor",
  fabricante: "fabricante",
  distribuidor: "distribuidor",
  material: "materialNome",
};

// Chave de período a partir da data (UTC, para evitar deslocamento por fuso).
function periodKey(d: Date, period: SismatPeriodo): string {
  const y = d.getUTCFullYear();
  if (period === "yearly") return String(y);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getSismatMetrics(
  dimension: SismatDimensao,
  period: SismatPeriodo,
  subMaterial?: string
): Promise<SismatMetricsData> {
  const field = DIM_FIELD[dimension];

  // Só aquisições com data de recebimento válida. Conjunto pequeno (~4,9k linhas),
  // então buscamos e agregamos em memória (sem SQL cru — evita injeção e é rápido).
  const rows = await db.sismatEntrada.findMany({
    where: {
      tipoMovimentacao: { in: [...TIPOS_AQUISICAO] },
      dtRecebimento: { not: null },
      ...(subMaterial ? { material: subMaterial } : {}),
    },
    select: {
      dtRecebimento: true,
      valorTotal: true,
      fornecedor: true,
      fabricante: true,
      distribuidor: true,
      materialNome: true,
    },
  });

  const seriesMap = new Map<string, number>(); // `${period}\u0000${key}` -> valor
  const totalMap = new Map<string, number>(); // period -> valor (todas as aquisições)
  const yearsSet = new Set<number>();
  let grandTotal = 0;

  for (const r of rows) {
    if (!r.dtRecebimento) continue;
    const val = r.valorTotal == null ? 0 : Number(r.valorTotal);
    const pk = periodKey(r.dtRecebimento, period);

    yearsSet.add(r.dtRecebimento.getUTCFullYear());
    totalMap.set(pk, (totalMap.get(pk) ?? 0) + val); // total independe da dimensão
    grandTotal += val;

    const key = (r[field] ?? "").toString().trim();
    if (!key) continue; // dimensão vazia não entra no ranking/série por entidade
    const sk = `${pk}\u0000${key}`;
    seriesMap.set(sk, (seriesMap.get(sk) ?? 0) + val);
  }

  const series: SismatSeriesPoint[] = [];
  for (const [k, valor] of seriesMap) {
    const sep = k.indexOf("\u0000");
    series.push({ period: k.slice(0, sep), key: k.slice(sep + 1), valor });
  }

  const totalsByPeriod: SismatTotalPoint[] = Array.from(totalMap, ([p, valor]) => ({
    period: p,
    valor,
  }));

  const years = Array.from(yearsSet).sort((a, b) => a - b);

  return {
    dimension,
    period,
    series,
    totalsByPeriod,
    years,
    grandTotal,
    hasData: rows.length > 0,
  };
}
