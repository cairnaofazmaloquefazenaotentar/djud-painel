import { db } from "@/lib/db";
import { TIPOS_AQUISICAO, type SismatPeriodo } from "@/lib/sismat-metrics";

/** Programa Saúde que caracteriza saída efetiva (entrega ao destinatário). */
const PROG_SAIDA_AQUISICAO = "DEMANDA JUDICIAL - Aquisição";

// ─────────────────────────────────────────────────────────────────────────────
// Métricas cruzadas Entradas × Saídas (inspirado no Relatório de Logística da
// CGLJUD): fluxo por período, saldo derivado acumulado e saldo por material.
//
// Recortes coerentes nos dois lados:
//   • Entradas: Tipo de Movimentação ∈ (ENTRADA ORÇAMENTÁRIA, EXTRA-ORÇ. / AQUISIÇÃO)
//   • Saídas:   Programa Saúde = "DEMANDA JUDICIAL - Aquisição"
//
// IMPORTANTE — leitura honesta do "saldo": é um SALDO DERIVADO dos dois
// extratos disponíveis (entradas − saídas do período coberto), NÃO o estoque
// contábil oficial do SISMAT. O estoque anterior a 2018 não está no extrato de
// entradas, e a valoração de saída pode diferir da de entrada — por isso o
// saldo global pode inclusive ser negativo. A chave de cruzamento por material
// é materialNome (normalizado); ela cobre ~97,6% do valor das saídas.
// ─────────────────────────────────────────────────────────────────────────────

export interface SismatFluxoPoint {
  period: string; // "YYYY-MM" ou "YYYY"
  entradas: number;
  saidas: number;
}

export interface SismatSaldoMaterial {
  nome: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface SismatEstoqueData {
  period: SismatPeriodo;
  /** Fluxo por período (união dos períodos das duas bases), ordenado cronologicamente. */
  fluxo: SismatFluxoPoint[];
  /** Entradas/saídas/saldo agregados por materialNome (ordenado por saldo desc). */
  porMaterial: SismatSaldoMaterial[];
  years: number[];
  totalEntradas: number;
  totalSaidas: number;
  /** totalEntradas − totalSaidas (saldo derivado do período coberto). */
  saldo: number;
  /** Materiais com saldo derivado positivo. */
  materiaisComSaldoPositivo: number;
  hasData: boolean;
}

function periodKey(d: Date, period: SismatPeriodo): string {
  const y = d.getUTCFullYear();
  if (period === "yearly") return String(y);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getSismatEstoqueMetrics(period: SismatPeriodo): Promise<SismatEstoqueData> {
  const [entradas, saidas] = await Promise.all([
    db.sismatEntrada.findMany({
      where: { tipoMovimentacao: { in: [...TIPOS_AQUISICAO] }, dtRecebimento: { not: null } },
      select: { dtRecebimento: true, valorTotal: true, materialNome: true },
    }),
    db.sismatSaida.findMany({
      where: { progSaude: PROG_SAIDA_AQUISICAO, dtBaixa: { not: null } },
      select: { dtBaixa: true, valorTotal: true, materialNome: true },
    }),
  ]);

  const fluxoMap = new Map<string, { entradas: number; saidas: number }>();
  const matMap = new Map<string, { entradas: number; saidas: number }>();
  const yearsSet = new Set<number>();
  let totalEntradas = 0;
  let totalSaidas = 0;

  const bump = (map: Map<string, { entradas: number; saidas: number }>, key: string, lado: "entradas" | "saidas", v: number) => {
    const cur = map.get(key) ?? { entradas: 0, saidas: 0 };
    cur[lado] += v;
    map.set(key, cur);
  };

  for (const r of entradas) {
    if (!r.dtRecebimento) continue;
    const v = r.valorTotal == null ? 0 : Number(r.valorTotal);
    totalEntradas += v;
    yearsSet.add(r.dtRecebimento.getUTCFullYear());
    bump(fluxoMap, periodKey(r.dtRecebimento, period), "entradas", v);
    const nome = (r.materialNome ?? "").trim();
    if (nome) bump(matMap, nome, "entradas", v);
  }

  for (const r of saidas) {
    if (!r.dtBaixa) continue;
    const v = r.valorTotal == null ? 0 : Number(r.valorTotal);
    totalSaidas += v;
    yearsSet.add(r.dtBaixa.getUTCFullYear());
    bump(fluxoMap, periodKey(r.dtBaixa, period), "saidas", v);
    const nome = (r.materialNome ?? "").trim();
    if (nome) bump(matMap, nome, "saidas", v);
  }

  const fluxo: SismatFluxoPoint[] = Array.from(fluxoMap, ([p, v]) => ({
    period: p,
    entradas: v.entradas,
    saidas: v.saidas,
  })).sort((a, b) => a.period.localeCompare(b.period)); // "YYYY-MM"/"YYYY": ordem lexicográfica = cronológica

  const porMaterial: SismatSaldoMaterial[] = Array.from(matMap, ([nome, v]) => ({
    nome,
    entradas: v.entradas,
    saidas: v.saidas,
    saldo: v.entradas - v.saidas,
  })).sort((a, b) => b.saldo - a.saldo);

  return {
    period,
    fluxo,
    porMaterial,
    years: Array.from(yearsSet).sort((a, b) => a - b),
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    materiaisComSaldoPositivo: porMaterial.filter((m) => m.saldo > 0).length,
    hasData: entradas.length > 0 || saidas.length > 0,
  };
}
