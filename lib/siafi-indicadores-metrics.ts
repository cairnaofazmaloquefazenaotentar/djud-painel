import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores de Valor SIAFI — Demanda × SiafiPagamento
//
// Cruza sismat."SiafiPagamento" com "Demanda" pelo número do processo (sem
// dígitos não-numéricos). Traz grupo temático (areaTematica), região, UF,
// TRF e status diretamente da tabela "Demanda".
//
// Nota: CRM e OAB não estão em "Demanda" — pertencem a
// sismat."RedmineSeiAtributos", que se liga a SismatSaida pelo SEI extraído
// do campo destinatario. Como Demanda não carrega o SEI, esse cruzamento não
// é feito aqui.
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

export const SIAFI_FILTROS = ["grupo", "regiao", "uf", "status"] as const;
export type SiafiIndicadoresFiltro = (typeof SIAFI_FILTROS)[number];
export type SiafiIndicadoresFiltros = Partial<Record<SiafiIndicadoresFiltro, string>>;

export interface SiafiIndicadoresOverview {
  kpis:      SiafiKpis;
  porGrupo:  RankItem[];
  porRegiao: RankItem[];
  porUF:     RankItem[]; // Top 15
  porTrf:    RankItem[];
  porStatus: RankItem[];
  opcoes:    Record<SiafiIndicadoresFiltro, FiltroOpcao[]>;
  hasData:   boolean;
}

export interface SiafiProcessoRow {
  processo:    string;
  medicamento: string;
  valor:       number;
  grupo:       string;
  regiao:      string;
  uf:          string;
  trf:         string;
  status:      string;
}

export interface SiafiIndicadoresTabela {
  kpis:   SiafiKpis;
  total:  number;
  rows:   SiafiProcessoRow[];
  limite: number;
}

// ── Base JOIN (Demanda ← SiafiPagamento) ─────────────────────────────────────

const SIAFI_JOIN = Prisma.sql`
  JOIN sismat."SiafiPagamento" p
    ON p."numeroProcesso" = regexp_replace(COALESCE(d."numeroProcesso", ''), '\\D', '', 'g')
       AND COALESCE(d."numeroProcesso", '') != ''
`;

// ── Helpers de filtro dinâmico ────────────────────────────────────────────────

type RawFiltro = Partial<{
  grupo:  string;
  regiao: string;
  uf:     string;
  status: string;
}>;

/**
 * Constrói a cláusula AND … para os filtros selecionados.
 * Retorna Prisma.sql`` vazio quando nenhum filtro está ativo.
 * O resultado é PREFIXADO com AND para ser colado depois de WHERE existente.
 */
function whereFiltros(f: RawFiltro): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  if (f.grupo)  partes.push(Prisma.sql`d."areaTematica" = ${f.grupo}`);
  if (f.regiao) partes.push(Prisma.sql`d."regiaoBrasil" = ${f.regiao}`);
  if (f.uf)     partes.push(Prisma.sql`d."ufResidencia" = ${f.uf}`);
  if (f.status) partes.push(Prisma.sql`d."status"       = ${f.status}`);
  if (!partes.length) return Prisma.sql``;
  const cond = partes.reduce((acc, cur) => Prisma.sql`${acc} AND ${cur}`);
  return Prisma.sql`AND ${cond}`;
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
    grupoRows,
    regiaoRows,
    ufRows,
    trfRows,
    statusRows,
    opGrupoRows,
    opRegiaoRows,
    opUfRows,
    opStatusRows,
  ] = await Promise.all([
    // KPIs globais
    db.$queryRaw<KpiRow[]>`
      SELECT
        COALESCE(SUM(p."valorOB"), 0)::float8      AS valor,
        COUNT(DISTINCT d.id)::bigint               AS processos,
        COUNT(DISTINCT d."principioAtivo")::bigint AS medicamentos,
        COUNT(*)::bigint                           AS pagamentos
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
    `,
    // Por Grupo Temático (areaTematica)
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."areaTematica", '(sem grupo)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."areaTematica"
      ORDER BY valor DESC
      LIMIT 15
    `,
    // Por Região Brasil
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."regiaoBrasil", '(sem região)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."regiaoBrasil"
      ORDER BY valor DESC
    `,
    // Top 15 UF Residência
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."ufResidencia", '(sem UF)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM public."Demanda" d
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
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."trfRegiao"
      ORDER BY valor DESC
    `,
    // Por Status
    db.$queryRaw<RankRow[]>`
      SELECT COALESCE(d."status", '(sem status)') AS chave,
             SUM(p."valorOB")::float8 AS valor
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      GROUP BY d."status"
      ORDER BY valor DESC
      LIMIT 10
    `,
    // Opções de filtro: Grupo
    db.$queryRaw<OpRow[]>`
      SELECT d."areaTematica" AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM public."Demanda" d ${SIAFI_JOIN} ${BASE_WHERE}
        AND d."areaTematica" IS NOT NULL AND d."areaTematica" != ''
      GROUP BY d."areaTematica" ORDER BY chave
    `,
    // Opções: Região
    db.$queryRaw<OpRow[]>`
      SELECT d."regiaoBrasil" AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM public."Demanda" d ${SIAFI_JOIN} ${BASE_WHERE}
        AND d."regiaoBrasil" IS NOT NULL AND d."regiaoBrasil" != ''
      GROUP BY d."regiaoBrasil" ORDER BY chave
    `,
    // Opções: UF
    db.$queryRaw<OpRow[]>`
      SELECT d."ufResidencia" AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM public."Demanda" d ${SIAFI_JOIN} ${BASE_WHERE}
        AND d."ufResidencia" IS NOT NULL AND d."ufResidencia" != ''
      GROUP BY d."ufResidencia" ORDER BY chave
    `,
    // Opções: Status
    db.$queryRaw<OpRow[]>`
      SELECT d."status" AS chave, COUNT(DISTINCT d.id)::bigint AS cnt
      FROM public."Demanda" d ${SIAFI_JOIN} ${BASE_WHERE}
        AND d."status" IS NOT NULL AND d."status" != ''
      GROUP BY d."status" ORDER BY chave
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

  return {
    kpis: {
      valor:        kpi.valor,
      processos:    Number(kpi.processos),
      medicamentos: Number(kpi.medicamentos),
      pagamentos:   Number(kpi.pagamentos),
    },
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
    },
    hasData: kpi.valor > 0 || Number(kpi.processos) > 0,
  };
}

// ── getSiafiIndicadoresTabela ─────────────────────────────────────────────────

const LIMITE_DEFAULT = 500;

interface TabelaRow {
  processo:    string;
  medicamento: string;
  valor:       number;
  grupo:       string;
  regiao:      string;
  uf:          string;
  trf:         string | null;
  status:      string;
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
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      ${filtroExtra}
    `,
    db.$queryRaw<TotalRow[]>`
      SELECT COUNT(DISTINCT d."numeroProcesso")::bigint AS total
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      ${filtroExtra}
    `,
    db.$queryRaw<TabelaRow[]>`
      SELECT
        COALESCE(d."numeroProcesso", '')          AS processo,
        COALESCE(d."principioAtivo", '')          AS medicamento,
        COALESCE(SUM(p."valorOB"), 0)::float8     AS valor,
        COALESCE(d."areaTematica", '')            AS grupo,
        COALESCE(d."regiaoBrasil", '')            AS regiao,
        COALESCE(d."ufResidencia", '')            AS uf,
        d."trfRegiao"::text                       AS trf,
        COALESCE(d."status", '')                  AS status
      FROM public."Demanda" d
      ${SIAFI_JOIN}
      ${BASE_WHERE}
      ${filtroExtra}
      GROUP BY
        d."numeroProcesso", d."principioAtivo",
        d."areaTematica", d."regiaoBrasil", d."ufResidencia",
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
      grupo:       r.grupo,
      regiao:      r.regiao,
      uf:          r.uf,
      trf:         r.trf != null ? `TRF ${r.trf}` : "",
      status:      r.status,
    })),
    limite,
  };
}
