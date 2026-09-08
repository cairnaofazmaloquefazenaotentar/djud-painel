import { db } from "@/lib/db";
import { type SismatPeriodo } from "@/lib/sismat-metrics";

const PROG_SAIDA_AQUISICAO = "DEMANDA JUDICIAL - Aquisição";

// ─────────────────────────────────────────────────────────────────────────────
// Métricas cruzadas Entradas × Saídas.
// NOTA: "saldo derivado" é Entradas − Saídas dos extratos disponíveis;
// NÃO é o estoque contábil oficial do SISMAT.
// ─────────────────────────────────────────────────────────────────────────────

export interface SismatFluxoPoint {
  period: string; // "YYYY-MM" ou "YYYY"
  entradas: number;
  saidas: number;
  saldoAcumulado: number;   // acumulado de (E - S) em R$
  entradasQty: number;
  saidasQty: number;
  saldoAcumuladoQty: number; // acumulado em unidades
}

export interface SismatSaldoMaterial {
  nome: string;           // material específico com dosagem (normalizado)
  principioAtivo: string; // materialNome (chave de cruzamento)
  entradas: number;       // R$
  saidas: number;         // R$
  saldo: number;          // R$
  quantidadeEntradas: number;
  quantidadeSaidas: number;
  saldoQuantidade: number;
  mediasSaidasMesBRL: number;  // média mensal últimos 12 meses (R$)
  mediasSaidasMesQty: number;  // média mensal últimos 12 meses (unidades)
  mesesEstoque: number | null; // saldoQty / mediasQty; null se sem dados
}

export interface SismatEstoqueData {
  period: SismatPeriodo;
  fluxo: SismatFluxoPoint[];
  porMaterial: SismatSaldoMaterial[];
  materiaisDisponiveis: string[]; // materiais com dosagem (normalizeMat de SismatEntrada.material)
  years: number[];
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalEntradasQty: number;
  totalSaidasQty: number;
  saldoQty: number;
  materiaisComSaldoPositivo: number;
  hasData: boolean;
}

function periodKey(d: Date, period: SismatPeriodo): string {
  const y = d.getUTCFullYear();
  if (period === "yearly") return String(y);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Remove prefixo de código (ex: "0860921 - VENETOCLAX 10MG" → "VENETOCLAX 10MG") e normaliza espaços. */
function normalizeMat(s: string): string {
  let v = (s ?? "").trim();
  const dashIdx = v.indexOf(" - ");
  if (dashIdx > 0 && /^\d+$/.test(v.slice(0, dashIdx))) {
    v = v.slice(dashIdx + 3);
  }
  return v.replace(/\s+/g, " ").trim().toUpperCase();
}

export async function getSismatEstoqueMetrics(
  period: SismatPeriodo,
  filterMaterialNome?: string,
): Promise<SismatEstoqueData> {
  const now = new Date();
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));

  // ── Step 1: distinct material names (com dosagem) de SismatEntrada ──────
  const materiaisRaw = await db.sismatEntrada.findMany({
    select: { material: true },
    distinct: ["material"],
  });

  // Mapa: nome normalizado → lista de valores raw (para filtrar no Prisma)
  const normToRaw = new Map<string, string[]>();
  for (const r of materiaisRaw) {
    const norm = normalizeMat(r.material);
    if (!norm) continue;
    const arr = normToRaw.get(norm) ?? [];
    arr.push(r.material);
    normToRaw.set(norm, arr);
  }
  const materiaisDisponiveis = [...normToRaw.keys()].sort();

  // ── Step 2: filtros e queries principais ────────────────────────────────
  const rawEntradaMateriais = filterMaterialNome
    ? (normToRaw.get(filterMaterialNome) ?? [])
    : null;

  const entradaWhere = {
    dtRecebimento: { not: null },
    ...(rawEntradaMateriais ? { material: { in: rawEntradaMateriais } } : {}),
  };
  // SismatSaida.material NÃO tem prefixo de código — é igual ao nome normalizado
  const saidaMatFilter = filterMaterialNome
    ? { material: filterMaterialNome }
    : {};
  const saidaWhere = {
    progSaude: PROG_SAIDA_AQUISICAO,
    dtBaixa: { not: null },
    ...saidaMatFilter,
  };

  const [entradas, saidas, saidasRecentes] = await Promise.all([
    db.sismatEntrada.findMany({
      where: entradaWhere,
      select: { dtRecebimento: true, valorTotal: true, materialNome: true, material: true, quantidade: true },
    }),
    db.sismatSaida.findMany({
      where: saidaWhere,
      select: { dtBaixa: true, valorTotal: true, materialNome: true, material: true, qtdEntregue: true },
    }),
    db.sismatSaida.findMany({
      where: { ...saidaMatFilter, progSaude: PROG_SAIDA_AQUISICAO, dtBaixa: { gte: twelveMonthsAgo } },
      select: { material: true, materialNome: true, valorTotal: true, qtdEntregue: true },
    }),
  ]);

  type FluxEntry = { entradas: number; saidas: number; entradasQty: number; saidasQty: number };
  type MatEntry = { principioAtivo: string; entradas: number; saidas: number; qty_e: number; qty_s: number };

  const fluxoMap = new Map<string, FluxEntry>();
  const matMap = new Map<string, MatEntry>();
  const mediaMap = new Map<string, { brl: number; qty: number }>();
  const yearsSet = new Set<number>();
  let totalEntradas = 0, totalSaidas = 0, totalEntradasQty = 0, totalSaidasQty = 0;

  for (const r of entradas) {
    if (!r.dtRecebimento) continue;
    const v = r.valorTotal == null ? 0 : Number(r.valorTotal);
    const qty = r.quantidade ?? 0;
    const pk = periodKey(r.dtRecebimento, period);
    const matKey = normalizeMat(r.material) || (r.materialNome ?? "").trim();

    totalEntradas += v;
    totalEntradasQty += qty;
    yearsSet.add(r.dtRecebimento.getUTCFullYear());

    const fc = fluxoMap.get(pk) ?? { entradas: 0, saidas: 0, entradasQty: 0, saidasQty: 0 };
    fc.entradas += v; fc.entradasQty += qty;
    fluxoMap.set(pk, fc);

    if (matKey) {
      const mc = matMap.get(matKey) ?? { principioAtivo: (r.materialNome ?? "").trim(), entradas: 0, saidas: 0, qty_e: 0, qty_s: 0 };
      mc.entradas += v; mc.qty_e += qty;
      matMap.set(matKey, mc);
    }
  }

  for (const r of saidas) {
    if (!r.dtBaixa) continue;
    const v = r.valorTotal == null ? 0 : Number(r.valorTotal);
    const qty = r.qtdEntregue ?? 0;
    const pk = periodKey(r.dtBaixa, period);
    const matKey = normalizeMat(r.material) || (r.materialNome ?? "").trim();

    totalSaidas += v;
    totalSaidasQty += qty;
    yearsSet.add(r.dtBaixa.getUTCFullYear());

    const fc = fluxoMap.get(pk) ?? { entradas: 0, saidas: 0, entradasQty: 0, saidasQty: 0 };
    fc.saidas += v; fc.saidasQty += qty;
    fluxoMap.set(pk, fc);

    if (matKey) {
      const mc = matMap.get(matKey) ?? { principioAtivo: (r.materialNome ?? "").trim(), entradas: 0, saidas: 0, qty_e: 0, qty_s: 0 };
      mc.saidas += v; mc.qty_s += qty;
      matMap.set(matKey, mc);
    }
  }

  // Média mensal dos últimos 12 meses (total / 12)
  for (const r of saidasRecentes) {
    const matKey = normalizeMat(r.material) || (r.materialNome ?? "").trim();
    if (!matKey) continue;
    const cur = mediaMap.get(matKey) ?? { brl: 0, qty: 0 };
    cur.brl += r.valorTotal == null ? 0 : Number(r.valorTotal);
    cur.qty += r.qtdEntregue ?? 0;
    mediaMap.set(matKey, cur);
  }

  // Fluxo com saldo acumulado
  let accBRL = 0, accQty = 0;
  const fluxo: SismatFluxoPoint[] = Array.from(fluxoMap, ([period, v]) => ({ period, ...v }))
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((f) => {
      accBRL += f.entradas - f.saidas;
      accQty += f.entradasQty - f.saidasQty;
      return {
        period: f.period,
        entradas: f.entradas,
        saidas: f.saidas,
        saldoAcumulado: accBRL,
        entradasQty: f.entradasQty,
        saidasQty: f.saidasQty,
        saldoAcumuladoQty: accQty,
      };
    });

  const porMaterial: SismatSaldoMaterial[] = Array.from(matMap, ([nome, v]) => {
    const media = mediaMap.get(nome) ?? { brl: 0, qty: 0 };
    const mediasBRL = media.brl / 12;
    const mediasQty = media.qty / 12;
    const saldoBRL = v.entradas - v.saidas;
    const saldoQty = v.qty_e - v.qty_s;

    let mesesEstoque: number | null = null;
    if (mediasQty > 0.001) mesesEstoque = saldoQty / mediasQty;
    else if (mediasBRL > 0) mesesEstoque = saldoBRL / mediasBRL;

    return {
      nome,
      principioAtivo: v.principioAtivo,
      entradas: v.entradas,
      saidas: v.saidas,
      saldo: saldoBRL,
      quantidadeEntradas: v.qty_e,
      quantidadeSaidas: v.qty_s,
      saldoQuantidade: saldoQty,
      mediasSaidasMesBRL: mediasBRL,
      mediasSaidasMesQty: mediasQty,
      mesesEstoque,
    };
  }).sort((a, b) => b.saldo - a.saldo);

  return {
    period,
    fluxo,
    porMaterial,
    materiaisDisponiveis,
    years: Array.from(yearsSet).sort((a, b) => a - b),
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    totalEntradasQty,
    totalSaidasQty,
    saldoQty: totalEntradasQty - totalSaidasQty,
    materiaisComSaldoPositivo: porMaterial.filter((m) => m.saldo > 0).length,
    hasData: entradas.length > 0 || saidas.length > 0,
  };
}
