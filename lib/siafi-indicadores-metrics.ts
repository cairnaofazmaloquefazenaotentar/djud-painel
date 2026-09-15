import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores de Valor SIAFI — Demanda × SiafiPagamento
//
// Cruza sismat."SiafiPagamento" com "Demanda" pelo número do processo (sem
// dígitos não-numéricos).  Traz CRM, OAB, grupo temático, região, UF, TRF e
// status diretamente da tabela "Demanda" (campos Redmine importados).
//
// Espelha a estrutura de sismat-saidas-redmine-metrics.ts, mas sem o HHI e
// sem as séries temporais — o usuário pediu a mesma estrutura visual de
// SismatSaidasView.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface SiafiKpis {
  valor:        number; // soma de valorOB
  processos:    number; // Demandas distintas com ≥1 pagamento
  medicamentos: number; // principioAtivo distintos
  pagamentos:   number; // linhas de SiafiPagamento cruzadas
}

export interface RankItem {
  l: string;
  v: number;
}

export interface FiltroOpcao {
  value: string;
  count: number;
}

export const SIAFI_FILTROS = ["grupo", "regiao", "uf", "status", "crm", "oab"] as const;
export type SiafiIndicadoresFiltro = (typeof SIAFI_FILTROS)[number];
export type SiafiIndicadoresFiltros = Partial<Record<SiafiIndicadoresFiltro, string>>;

export interface SiafiIndicadoresOverview {
  kpis:      SiafiKpis;
  porCrm:    RankItem[]; // Top 15 por valor pago
  porOab:    RankItem[]; // Top 15 por valor pago
  porGrupo:  RankItem[];
  porRegiao: RankItem[];
  porUF:     RankItem[]; // Top 15
  porTrf:    RankItem[];
  porStatus: RankItem[];
  opcoes:    Record<SiafiIndicadoresFiltro, FiltroOpcao[]>;
  hasData:   boolean;
}

export interface SiafiProcessoRow {
  processo:  string;
  medicamento: string;
  valor:     number;
  crm:       string;
  oab:       string;
  grupo:     string;
  regiao:    string;
  uf:        string;
  trf:       string;
  status:    string;
}

export interface SiafiIndicadoresTabela {
  kpis:   SiafiKpis;
  total:  number;
  rows:   SiafiProcessoRow[];
  limite: number;
}

// ── Helpers de colunas derivadas ──────────────────────────────────────────────

/** Chave CRM no formato "12345/SP" ou "" quando vazio. */
const CRM_KEY = Prisma.sql`
  CASE WHEN COALESCE(d."crm", '') = '' THEN ''
       ELSE d."crm" || '/' || COALESCE(NULLIF(d."ufCrm", ''), 'NA')
  END
`;

/** Chave OAB no formato "12345/SP" ou "" quando vazio. */
const OAB_KEY = Prisma.sql`
  CASE WHEN COALESCE(d."oab", '') = '' THEN ''
       ELSE d."oab" || '/' || COALESCE(NULLIF(d."ufOab", ''), 'NA')
  END
`;

// ── Base JOIN (Demanda ← SiafiPagamento) ─────────────────────────────────────

const SIAFI_JOIN = Prisma.sql`
  JOIN sismat."SiafiPagamento" p
    ON p."numeroProcesso" = regexp_replace(COALESCE(d."numeroProcesso", ''), '\\D', '', 'g')
`;

// ── Helpers de filtro dinâmico ────────────────────────────────────────────────

type RawFiltro = Partial<{
  grupo:  string;
  regiao: string;
  uf:     string;
  status: string;
  crm:    string; // "12345/SP"
  oab:    string; // "67890/RJ"
}>;

/**
 * Constrói a cláusula WHERE extra para os filtros selecionados.
 * Retorna Prisma.sql`` vazio quando nenhum filtro está ativo.
 */
function whereFiltros(f: RawFiltro): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  if (f.grupo)  partes.push(Prisma.sql`d."grupoTematico" = ${f.grupo}`);
  if (f.regiao) partes.push(Prisma.sql`d."regiaoBrasil"  = ${f.regiao}`);
  if (f.uf)     partes.push(Prisma.sql`d."ufResidencia"  = ${f.uf}`);
  if (f.status) partes.push(Prisma.sql`d."status"        = ${f.status}`);
  if (f.crm) {
    const [crmNum, crmUf] = f.crm.split("/");
    partes.push(Prisma.sql`d."crm" = ${crmNum} AND COALESCE(NULLIF(d."ufCrm",''),'NA') = ${crmUf ?? "NA"}`);
  }
  if (f.oab) {
    const [oabNum, oabUf] = f.oab.split("/");
    partes.push(Prisma.sql`d."oab" = ${oabNum} AND COALESCE(NULLIF(d."ufOab",''),'NA') = ${oabUf ?? "NA"}`);
  }
  if (!partes.length) return Prisma.sql``;
  return partes.reduce((acc, cur) => Prisma.sql`${acc} AND ${cur}`);
}

// ── Tipos intermediários das queries raw ──────────────────────────────────────

interface KpiRow   { valor: number; processos: bigint; medicamentos: bigint; pagamentos: bigint; }
interface RankRow  { chave: string; valor: number; }
interface OpRow    { chave: string; cnt: bigint; }

// ── getSiafiIndicadoresOverview ───────────────────────────────────────────────

export async function getSiafiIndicadoresOverview(): Promise<SiafiIndicadoresOverview> {
  const BASE_WHERE = Prisma.sql`WHERE d."deletedAt" IS NULL`;

  const [
    kpiRows,
    crmRows,
    oabRows,
    grupoRows,
    regiaoRows,
    ufRows,
    trfRows,
    statusRows,
    opGrupoRows,
    opRegiaoRows,
    opUfRows,
    opStatusRows,
    opCrmRows,
    opOabRows,
  ] = await Promise.all([
    // KPIs globais
    db.$queryRaw<KpiRow[]>`
      SELECT
        COALESCE(SUM(p."valorOB"), 0)::float8      AS valor,
        COUNT(DISTINCT d.id)::bigint               AS processos,
        COUNT(DISTINCT d."principioAtivo")::bigint AS medicamentos,
        COUNT(*)::bigint                           AS pagamentos
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
    `,
    // Top 15 CRM
    db.$queryRaw<RankRow[]>`
      SELECT ${CRM_KEY} AS chave, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE} AND d."crm" IS NOT NULL AND d."crm" != ''
      GROUP BY d."crm", d."ufCrm"
      ORDER BY valor DESC
      LIMIT 15
    `,
    // Top 15 OAB
    db.$queryRaw<RankRow[]>`
      SELECT ${OAB_KEY} AS chave, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE} AND d."oab" IS NOT NULL AND d."oab" != ''
      GROUP BY d."oab", d."ufOab"
      ORDER BY valor DESC
      LIMIT 15
    `,
    // Por Grupo Temático
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."grupoTematico", '(sem grupo)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."grupoTematico"
      ORDER BY valor DESC
      LIMIT 15
    `,
    // Por Região Brasil
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."regiaoBrasil", '(sem região)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."regiaoBrasil"
      ORDER BY valor DESC
    `,
    // Top 15 UF Residência
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."ufResidencia", '(sem UF)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."ufResidencia"
      ORDER BY valor DESC
      LIMIT 15
    `,
    // Por TRF
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."trfRegiao"::text, '(sem TRF)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."trfRegiao"
      ORDER BY valor DESC
    `,
    // Por Status
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."status", '(sem status)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."status"
      ORDER BY valor DESC
      LIMIT 10
    `,
    // Opções de filtro: Grupo
    db.$queryRaw<OpRow[]>`
      SELECT COALESCE(d."grupoTematico", '') AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM "Demanda" d ${SIAFI_JOIN} ${BASE_WHERE} AND d."grupoTematico" IS NOT NULL AND d."grupoTematico" != ''
      GROUP BY d."grupoTematico" ORDER BY chave
    `,
    // Opções: Região
    db.$queryRaw<OpRow[]>`
      SELECT COALESCE(d."regiaoBrasil", '') AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM "Demanda" d ${SIAFI_JOIN} ${BASE_WHERE} AND d."regiaoBrasil" IS NOT NULL AND d."regiaoBrasil" != ''
      GROUP BY d."regiaoBrasil" ORDER BY chave
    `,
    // Opções: UF
    db.$queryRaw<OpRow[]>`
      SELECT COALESCE(d."ufResidencia", '') AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM "Demanda" d ${SIAFI_JOIN} ${BASE_WHERE} AND d."ufResidencia" IS NOT NULL AND d."ufResidencia" != ''
      GROUP BY d."ufResidencia" ORDER BY chave
    `,
    // Opções: Status
    db.$queryRaw<OpRow[]>`
      SELECT COALESCE(d."status", '') AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM "Demanda" d ${SIAFI_JOIN} ${BASE_WHERE} AND d."status" IS NOT NULL AND d."status" != ''
      GROUP BY d."status" ORDER BY chave
    `,
    // Opções: CRM
    db.$queryRaw<OpRow[]>`
      SELECT ${CRM_KEY} AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM "Demanda" d ${SIAFI_JOIN} ${BASE_WHERE} AND d."crm" IS NOT NULL AND d."crm" != ''
      GROUP BY d."crm", d."ufCrm" ORDER BY cnt DESC LIMIT 300
    `,
    // Opções: OAB
    db.$queryRaw<OpRow[]>`
      SELECT ${OAB_KEY} AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM "Demanda" d ${SIAFI_JOIN} ${BASE_WHERE} AND d."oab" IS NOT NULL AND d."oab" != ''
      GROUP BY d."oab", d."ufOab" ORDER BY cnt DESC LIMIT 300
    `,
  ]);

  const kpi = kpiRows[0] ?? { valor: 0, processos: 0n, medicamentos: 0n, pagamentos: 0n };

  const toRankItems = (rows: RankRow[]): RankItem[] =>
    rows.map((r) => ({ l: r.chave, v: r.valor }));

  const toOpcoes = (rows: OpRow[]): FiltroOpcao[] =>
    rows.filter((r) => r.chave).map((r) => ({ value: r.chave, count: Number(r.cnt) }));

  // Format TRF label for display
  const porTrf = trfRows.map((r) => ({
    l: r.chave === "(sem TRF)" ? r.chave : `TRF ${r.chave}`,
    v: r.valor,
  }));

  const overview: SiafiIndicadoresOverview = {
    kpis: {
      valor:        kpi.valor,
      processos:    Number(kpi.processos),
      medicamentos: Number(kpi.medicamentos),
      pagamentos:   Number(kpi.pagamentos),
    },
    porCrm:    toRankItems(crmRows),
    porOab:    toRankItems(oabRows),
    porGrupo:  toRankItems(grupoRows),
    porRegiao: toRankItems(regiaoRows),
    porUF:     toRankItems(ufRows),
    porTrf,
    porStatus: toRankItems(statusRows),
    opcoes: {
      grupo:  toOpcoes(opGrupoRows),
      regiao: toOpcoes(opRegiaoRows),
      uf:     toOpcoes(opUfRows),
      status: toOpcoes(opStatusRows),
      crm:    toOpcoes(opCrmRows),
      oab:    toOpcoes(opOabRows),
    },
    hasData: kpi.valor > 0 || Number(kpi.processos) > 0,
  };

  return overview;
}

// ── getSiafiIndicadoresTabela ─────────────────────────────────────────────────

const LIMITE_DEFAULT = 500;

interface TabelaRow {
  processo:   string;
  medicamento: string;
  valor:      number;
  crm:        string;
  oab:        string;
  grupo:      string;
  regiao:     string;
  uf:         string;
  trf:        string | null;
  status:     string;
}

interface TabelaKpiRow {
  valor:        number;
  processos:    bigint;
  medicamentos: bigint;
  pagamentos:   bigint;
}

interface TotalRow { total: bigint; }

export async function getSiafiIndicadoresTabela(
  filtros: SiafiIndicadoresFiltros,
  limite: number = LIMITE_DEFAULT
): Promise<SiafiIndicadoresTabela> {
  const BASE_WHERE = Prisma.sql`WHERE d."deletedAt" IS NULL`;
  const filtroExtra = whereFiltros(filtros);

  const [kpiRows, totalRows, rows] = await Promise.all([
    db.$queryRaw<TabelaKpiRow[]>`
      SELECT
        COALESCE(SUM(p."valorOB"), 0)::float8      AS valor,
        COUNT(DISTINCT d.id)::bigint               AS processos,
        COUNT(DISTINCT d."principioAtivo")::bigint AS medicamentos,
        COUNT(*)::bigint                           AS pagamentos
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      ${filtroExtra}
    `,
    db.$queryRaw<TotalRow[]>`
      SELECT COUNT(*)::bigint AS total
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      ${filtroExtra}
    `,
    db.$queryRaw<TabelaRow[]>`
      SELECT
        COALESCE(d."numeroProcesso", '')          AS processo,
        COALESCE(d."principioAtivo", '')          AS medicamento,
        COALESCE(SUM(p."valorOB"), 0)::float8     AS valor,
        ${CRM_KEY}                                AS crm,
        ${OAB_KEY}                                AS oab,
        COALESCE(d."grupoTematico", '')           AS grupo,
        COALESCE(d."regiaoBrasil", '')            AS regiao,
        COALESCE(d."ufResidencia", '')            AS uf,
        d."trfRegiao"::text                       AS trf,
        COALESCE(d."status", '')                  AS status
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      ${filtroExtra}
      GROUP BY
        d."numeroProcesso", d."principioAtivo",
        d."crm", d."ufCrm", d."oab", d."ufOab",
        d."grupoTematico", d."regiaoBrasil", d."ufResidencia",
        d."trfRegiao", d."status"
      ORDER BY valor DESC
      LIMIT ${limite}
    `,
  ]);

  const kpi = kpiRows[0] ?? { valor: 0, processos: 0n, medicamentos: 0n, pagamentos: 0n };

  return {
    kpis: {
      valor:        kpi.valor,
      processos:    Number(kpi.processos),
      medicamentos: Number(kpi.medicamentos),
      pagamentos:   Number(kpi.pagamentos),
    },
    total:  Number(totalRows[0]?.total ?? 0n),
    rows:   rows.map((r) => ({
      processo:    r.processo,
      medicamento: r.medicamento,
      valor:       r.valor,
      crm:         r.crm,
      oab:         r.oab,
      grupo:       r.grupo,
      regiao:      r.regiao,
      uf:          r.uf,
      trf:         r.trf != null ? `TRF ${r.trf}` : "",
      status:      r.status,
    })),
    limite,
  };
}
