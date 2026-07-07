import { db } from "@/lib/db";
import type { SismatPeriodo, SismatSeriesPoint, SismatTotalPoint } from "@/lib/sismat-metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Métricas do dashboard de Saídas SISMAT (entregas/baixas de material)
//
// Recorte de "saída efetiva": Programa Saúde = "DEMANDA JUDICIAL - Aquisição".
// Devoluções (1.540 linhas, ~R$ 288 mi) têm valor mas não são entrega ao
// destinatário — ficam fora, espelhando o recorte de aquisições das entradas.
// A série temporal usa dtBaixa (granularidade MENSAL — a base não tem dia).
// ─────────────────────────────────────────────────────────────────────────────

export const SISMAT_SAIDA_DIMENSOES = ["material", "fornecedor", "uf", "tipoDestinatario"] as const;
export type SismatSaidaDimensao = (typeof SISMAT_SAIDA_DIMENSOES)[number];

/** Programa Saúde que caracteriza saída efetiva (entrega). */
export const PROG_SAIDA_AQUISICAO = "DEMANDA JUDICIAL - Aquisição";

export const SISMAT_SAIDA_DIM_LABELS: Record<SismatSaidaDimensao, string> = {
  material: "Material",
  fornecedor: "Fornecedor",
  uf: "UF",
  tipoDestinatario: "Tipo de destinatário",
};

export interface SismatSaidasMetricsData {
  dimension: SismatSaidaDimensao;
  period: SismatPeriodo;
  series: SismatSeriesPoint[];
  totalsByPeriod: SismatTotalPoint[];
  years: number[];
  grandTotal: number;
  hasData: boolean;
}

const DIM_FIELD: Record<SismatSaidaDimensao, "materialNome" | "fornecedor" | "uf" | "tipoDestinatario"> = {
  material: "materialNome",
  fornecedor: "fornecedor",
  uf: "uf",
  tipoDestinatario: "tipoDestinatario",
};

function periodKey(d: Date, period: SismatPeriodo): string {
  const y = d.getUTCFullYear();
  if (period === "yearly") return String(y);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getSismatSaidasMetrics(
  dimension: SismatSaidaDimensao,
  period: SismatPeriodo
): Promise<SismatSaidasMetricsData> {
  const field = DIM_FIELD[dimension];

  const rows = await db.sismatSaida.findMany({
    where: {
      progSaude: PROG_SAIDA_AQUISICAO,
      dtBaixa: { not: null },
    },
    select: {
      dtBaixa: true,
      valorTotal: true,
      materialNome: true,
      fornecedor: true,
      uf: true,
      tipoDestinatario: true,
    },
  });

  const seriesMap = new Map<string, number>();
  const totalMap = new Map<string, number>();
  const yearsSet = new Set<number>();
  let grandTotal = 0;

  for (const r of rows) {
    if (!r.dtBaixa) continue;
    const val = r.valorTotal == null ? 0 : Number(r.valorTotal);
    const pk = periodKey(r.dtBaixa, period);

    yearsSet.add(r.dtBaixa.getUTCFullYear());
    totalMap.set(pk, (totalMap.get(pk) ?? 0) + val);
    grandTotal += val;

    const key = (r[field] ?? "").toString().trim();
    if (!key) continue;
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

  return {
    dimension,
    period,
    series,
    totalsByPeriod,
    years: Array.from(yearsSet).sort((a, b) => a - b),
    grandTotal,
    hasData: rows.length > 0,
  };
}
