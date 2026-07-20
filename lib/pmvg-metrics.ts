import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Métricas da sub-aba "PMVG" (aba Preços) — preço unitário pago no SISMAT vs.
// preço PMVG vigente na data de entrega (tabela sismat.SismatPmvg).
//
// Diferente da base ComprasGov (~53 mil linhas, agregada no servidor), a base
// SISMAT × PMVG é pequena (~1,3 mil compras). Toda a matemática pago-vs-PMVG,
// os filtros e as estatísticas por alíquota são dinâmicos (a alíquota do PMVG é
// escolhida pelo usuário), então uma única consulta entrega TODAS as linhas e o
// cliente reproduz o dashboard de origem sem novas idas ao servidor.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Colunas de alíquota do PMVG, na MESMA ordem do array `pmvgPrecos` gravado no
 * banco (índice i de PMVG_COLS ↔ índice i de row.p). Ordem/valores idênticos ao
 * dashboard de origem — o script de importação valida que o HTML bate com isto.
 */
export const PMVG_COLS = [
  "PMVG 0%",
  "PMVG 12%",
  "PMVG 12% ALC",
  "PMVG 17%",
  "PMVG 17% ALC",
  "PMVG 17,5%",
  "PMVG 17,5% ALC",
  "PMVG 18%",
  "PMVG 18% ALC",
  "PMVG 19%",
  "PMVG 19% ALC",
  "PMVG 19,5%",
  "PMVG 19,5% ALC",
  "PMVG 20%",
  "PMVG 20% ALC",
  "PMVG 20,5%",
  "PMVG 20,5% ALC",
  "PMVG 21%",
  "PMVG 21% ALC",
  "PMVG 22%",
  "PMVG 22% ALC",
  "PMVG 22,5%",
  "PMVG 22,5% ALC",
  "PMVG 23%",
  "PMVG 23% ALC",
  "PMVG Sem Impostos",
] as const;

/** Uma compra pareada — chaves curtas (mesma semântica da base de origem). */
export interface PmvgRow {
  m: string; // material (SISMAT)
  sm: string; // medicamento/princípio ativo (PMVG)
  f: string; // fabricante
  d: string; // data de entrega "YYYY-MM-DD"
  q: number; // quantidade de unidades
  vu: number; // valor unitário pago (R$)
  vt: number; // valor total pago (R$)
  sc: number; // score do match (0–100)
  qp: number; // unidades por embalagem estimadas
  qm: string; // método da qtd/emb.: leading_count | trailing_x | default_single
  pd: string | null; // competência do PMVG usada "YYYY-MM-DD" (1º do mês) ou null
  ap: string | null; // apresentação do PMVG pareado
  p: (number | null)[]; // preço de embalagem por alíquota (ordem de PMVG_COLS)
}

export interface PmvgData {
  /** Rótulos das alíquotas, alinhados a `p[]` de cada linha. */
  cols: string[];
  /** Todas as compras pareadas (uma linha por compra do SISMAT). */
  rows: PmvgRow[];
  totalRegistros: number;
  /** Compras com ao menos uma alíquota de PMVG encontrada. */
  comPmvg: number;
  dataMin: string | null; // "YYYY-MM-DD"
  dataMax: string | null;
  /** Materiais distintos (ordem alfabética) — opções do filtro. */
  materiais: string[];
  /** Fabricantes distintos (ordem alfabética) — opções do filtro. */
  fabricantes: string[];
  hasData: boolean;
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export async function getPmvgData(): Promise<PmvgData> {
  const registros = await db.sismatPmvg.findMany({
    orderBy: { dtEntrega: "asc" },
    select: {
      material: true,
      subMaterial: true,
      fabricante: true,
      dtEntrega: true,
      quantidade: true,
      valorUnitario: true,
      valorTotal: true,
      score: true,
      qtdEmbalagem: true,
      metodoQtd: true,
      pmvgCompetencia: true,
      apresentacao: true,
      pmvgPrecos: true,
    },
  });

  const rows: PmvgRow[] = registros.map((r) => ({
    m: r.material,
    sm: r.subMaterial,
    f: r.fabricante,
    d: toISODate(r.dtEntrega),
    q: r.quantidade,
    vu: Number(r.valorUnitario),
    vt: Number(r.valorTotal),
    sc: r.score,
    qp: r.qtdEmbalagem,
    qm: r.metodoQtd,
    pd: r.pmvgCompetencia ? toISODate(r.pmvgCompetencia) : null,
    ap: r.apresentacao,
    // pmvgPrecos é Json; normaliza para (number|null)[] no comprimento de PMVG_COLS.
    p: normalizePmvgPrecos(r.pmvgPrecos),
  }));

  const materiais = Array.from(new Set(rows.map((r) => r.m))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  const fabricantes = Array.from(new Set(rows.map((r) => r.f))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  let dataMin: string | null = null;
  let dataMax: string | null = null;
  let comPmvg = 0;
  for (const r of rows) {
    if (!dataMin || r.d < dataMin) dataMin = r.d;
    if (!dataMax || r.d > dataMax) dataMax = r.d;
    if (r.p.some((v) => v !== null)) comPmvg += 1;
  }

  return {
    cols: [...PMVG_COLS],
    rows,
    totalRegistros: rows.length,
    comPmvg,
    dataMin,
    dataMax,
    materiais,
    fabricantes,
    hasData: rows.length > 0,
  };
}

/** Garante um array de tamanho fixo (PMVG_COLS) com números ou null. */
function normalizePmvgPrecos(value: unknown): (number | null)[] {
  const arr = Array.isArray(value) ? value : [];
  return PMVG_COLS.map((_, i) => {
    const v = arr[i];
    return typeof v === "number" && isFinite(v) ? v : null;
  });
}
