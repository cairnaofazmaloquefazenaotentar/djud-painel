import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard de Saídas — SISMAT × Redmine (por nº SEI)
//
// Cada saída do SISMAT carrega o nº SEI como ÚLTIMO TOKEN do campo
// destinatario ("FULANO DE TAL 00737.001234/2020-11"). O token é extraído em
// SQL e cruzado com sismat.RedmineSeiAtributos (1 linha por NUP, gerada pelo
// scripts/import-redmine-sei.ts a partir da base Redmine), trazendo CRM, OAB,
// Grupo Temático, Região, UF, Forma de Cumprimento, Modalidade, Status do
// Abastecimento e Status Redmine para cada saída.
//
// Recorte: TODAS as linhas de SismatSaida (Aquisição + Devolução) — réplica do
// dashboard_redmine_sismat.html de referência (43.550 saídas, R$ 10,82 bi).
// Difere do recorte "só Aquisição" usado no comparativo E×S do Estoque.
//
// Saídas cujo último token não é um NUP válido (ex.: destinatário "… LTDA" de
// devoluções) simplesmente não casam com o Redmine e aparecem com atributos
// vazios — comportamento idêntico ao dashboard de referência.
// ─────────────────────────────────────────────────────────────────────────────

/** Último token do destinatario = nº SEI candidato ('' quando não há). */
const SEI_EXPR = Prisma.sql`COALESCE(NULLIF(regexp_replace(btrim(s."destinatario"), '^.*\\s', ''), ''), '')`;

/** SELECT base do cruzamento (LEFT JOIN — saída sem match fica com attrs ''). */
const BASE_SELECT = Prisma.sql`
  SELECT
    COALESCE(s."valorTotal", 0)::float8      AS valor,
    s."material"                             AS material,
    ${SEI_EXPR}                              AS sei,
    CASE WHEN COALESCE(a."crm", '') = '' THEN ''
         ELSE a."crm" || '/' || COALESCE(NULLIF(a."ufCrm", ''), 'NA')
    END                                      AS crm,
    CASE WHEN COALESCE(a."oab", '') = '' THEN ''
         ELSE a."oab" || '/' || COALESCE(NULLIF(a."ufOab", ''), 'NA')
    END                                      AS oab,
    COALESCE(a."grupoTematico", '')          AS grupo,
    COALESCE(a."regiaoBrasil", '')           AS regiao,
    COALESCE(a."ufResidencia", '')           AS uf,
    COALESCE(a."formaCumprimento", '')       AS forma,
    COALESCE(a."modalidadeTratamento", '')   AS modal,
    COALESCE(a."statusAbastecimento", '')    AS sabast,
    COALESCE(a."statusRedmine", '')          AS status
  FROM sismat."SismatSaida" s
  LEFT JOIN sismat."RedmineSeiAtributos" a
    ON a."sei" = NULLIF(regexp_replace(btrim(s."destinatario"), '^.*\\s', ''), '')
`;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SaidaRedmineRow {
  valor: number;
  material: string;
  sei: string;
  crm: string;
  oab: string;
  grupo: string;
  regiao: string;
  uf: string;
  forma: string;
  modal: string;
  sabast: string;
  status: string;
}

export interface SaidasRedmineKpis {
  valor: number;
  processos: number; // SEIs distintos (token não-vazio)
  medicamentos: number; // materiais distintos
  saidas: number; // linhas
}

export interface RankItem {
  l: string;
  v: number;
}

export interface FiltroOpcao {
  value: string;
  count: number;
}

/** Campos filtráveis — equivalem às colunas de atributos do cruzamento. */
export const SAIDAS_REDMINE_FILTROS = [
  "grupo",
  "regiao",
  "uf",
  "forma",
  "modal",
  "sabast",
  "status",
  "crm",
  "oab",
] as const;
export type SaidasRedmineFiltro = (typeof SAIDAS_REDMINE_FILTROS)[number];
export type SaidasRedmineFiltros = Partial<Record<SaidasRedmineFiltro, string>>;

export interface SaidasRedmineOverview {
  kpis: SaidasRedmineKpis;
  topMed: RankItem[]; // Top 20 medicamentos por valor
  porCrm: RankItem[]; // Top 15 CRM por valor
  porOab: RankItem[]; // Top 15 OAB por valor
  porGrupo: RankItem[];
  porRegiao: RankItem[];
  porForma: RankItem[];
  porSabast: RankItem[];
  opcoes: Record<SaidasRedmineFiltro, FiltroOpcao[]>;
  hasData: boolean;
}

export interface SaidasRedmineTabela {
  kpis: SaidasRedmineKpis; // sobre TODAS as linhas que casam com os filtros
  total: number; // nº de linhas que casam
  rows: SaidaRedmineRow[]; // primeiras `limite`, por valor desc
  limite: number;
}

// ── Helpers de agregação ──────────────────────────────────────────────────────

function kpisDe(rows: SaidaRedmineRow[]): SaidasRedmineKpis {
  let valor = 0;
  const seis = new Set<string>();
  const meds = new Set<string>();
  for (const r of rows) {
    valor += r.valor;
    if (r.sei) seis.add(r.sei);
    if (r.material) meds.add(r.material);
  }
  return { valor, processos: seis.size, medicamentos: meds.size, saidas: rows.length };
}

function ranking(rows: SaidaRedmineRow[], campo: keyof SaidaRedmineRow, topN: number): RankItem[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r[campo] as string;
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + r.valor);
  }
  return Array.from(m, ([l, v]) => ({ l, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, topN);
}

function opcoesDe(rows: SaidaRedmineRow[], campo: SaidasRedmineFiltro): FiltroOpcao[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r[campo];
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([value, count]) => ({ value, count })).sort((a, b) =>
    a.value.localeCompare(b.value, "pt-BR")
  );
}

// ── Consultas ─────────────────────────────────────────────────────────────────

/** Agregados globais (gráficos estáticos + opções de filtro). Cacheável. */
export async function getSaidasRedmineOverview(): Promise<SaidasRedmineOverview> {
  const rows = await db.$queryRaw<SaidaRedmineRow[]>(BASE_SELECT);

  const opcoes = Object.fromEntries(
    SAIDAS_REDMINE_FILTROS.map((f) => [f, opcoesDe(rows, f)])
  ) as Record<SaidasRedmineFiltro, FiltroOpcao[]>;

  return {
    kpis: kpisDe(rows),
    topMed: ranking(rows, "material", 20),
    porCrm: ranking(rows, "crm", 15),
    porOab: ranking(rows, "oab", 15),
    porGrupo: ranking(rows, "grupo", 99),
    porRegiao: ranking(rows, "regiao", 99),
    porForma: ranking(rows, "forma", 99),
    porSabast: ranking(rows, "sabast", 99),
    opcoes,
    hasData: rows.length > 0,
  };
}

const FILTRO_COLUNA: Record<SaidasRedmineFiltro, Prisma.Sql> = {
  grupo: Prisma.sql`a."grupoTematico"`,
  regiao: Prisma.sql`a."regiaoBrasil"`,
  uf: Prisma.sql`a."ufResidencia"`,
  forma: Prisma.sql`a."formaCumprimento"`,
  modal: Prisma.sql`a."modalidadeTratamento"`,
  sabast: Prisma.sql`a."statusAbastecimento"`,
  status: Prisma.sql`a."statusRedmine"`,
  crm: Prisma.sql`CASE WHEN COALESCE(a."crm", '') = '' THEN '' ELSE a."crm" || '/' || COALESCE(NULLIF(a."ufCrm", ''), 'NA') END`,
  oab: Prisma.sql`CASE WHEN COALESCE(a."oab", '') = '' THEN '' ELSE a."oab" || '/' || COALESCE(NULLIF(a."ufOab", ''), 'NA') END`,
};

/** KPIs filtrados + primeiras `limite` linhas (por valor desc). */
export async function getSaidasRedmineTabela(
  filtros: SaidasRedmineFiltros,
  limite = 500
): Promise<SaidasRedmineTabela> {
  const conds: Prisma.Sql[] = [];
  for (const f of SAIDAS_REDMINE_FILTROS) {
    const v = filtros[f];
    if (v) conds.push(Prisma.sql`${FILTRO_COLUNA[f]} = ${v}`);
  }
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;

  const rows = await db.$queryRaw<SaidaRedmineRow[]>(
    Prisma.sql`${BASE_SELECT} ${where} ORDER BY s."valorTotal" DESC NULLS LAST`
  );

  return {
    kpis: kpisDe(rows),
    total: rows.length,
    rows: rows.slice(0, limite),
    limite,
  };
}
