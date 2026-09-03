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
// Abastecimento, Status Redmine, Autor (paciente) e TRF Região para cada saída.
//
// Recorte: TODAS as linhas de SismatSaida (Aquisição + Devolução) — réplica do
// dashboard_redmine_sismat.html de referência (43.550 saídas, R$ 10,82 bi).
// Difere do recorte "só Aquisição" usado no comparativo E×S do Estoque.
//
// Saídas cujo último token não é um NUP válido (ex.: destinatário "… LTDA" de
// devoluções) simplesmente não casam com o Redmine e aparecem com atributos
// vazios — comportamento idêntico ao dashboard de referência.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai e normaliza o NUP/SEI de qualquer string de destinatário.
 *
 * Equivalente Python (dashboard de referência):
 *   str_extr.extract('(\d{5})\.?\d{5,6}\/?\d{4}-?\d{1,2}') + '.'
 *         + str_extr.extract('\d{5}\.?(\d{5,6})\/?\d{4}-?\d{1,2}') + '/'
 *         + str_extr.extract('\d{5}\.?\d{5,6}\/?(\d{4})-?\d{1,2}') + '-'
 *         + str_extr.extract('\d{5}\.?\d{5,6}\/?\d{4}-?(\d{1,2})')
 *
 * O padrão localiza o NUP no meio da string (sem depender de posição ou
 * separadores), extrai os 4 grupos e monta sempre no formato canônico
 * "DDDDD.DDDDDD/YYYY-DD" — tolerando ausência de '.', '/' ou '-'.
 *
 * Retorna NULL quando nenhum NUP é encontrado no campo.
 */
const SEI_PAT = `([0-9]{5})\\.?([0-9]{5,6})/?([0-9]{4})-?([0-9]{1,2})`;

/**
 * LATERAL que extrai o SEI uma única vez por linha e o normaliza.
 * Usado tanto no SELECT quanto no JOIN, evitando recomputação.
 */
const SEI_LATERAL = Prisma.sql`
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN m IS NOT NULL
        THEN m[1] || '.' || m[2] || '/' || m[3] || '-' || m[4]
        ELSE NULL
      END AS sei_norm
    FROM (
      SELECT regexp_match(s."destinatario", ${SEI_PAT}) AS m
    ) t
  ) AS sei_ext
`;

/** SELECT base do cruzamento (LEFT JOIN — saída sem match fica com attrs ''). */
const BASE_SELECT = Prisma.sql`
  SELECT
    COALESCE(s."valorTotal", 0)::float8      AS valor,
    s."material"                             AS material,
    COALESCE(sei_ext.sei_norm, '')           AS sei,
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
    COALESCE(a."statusRedmine", '')          AS status,
    COALESCE(a."autor", '')                  AS autor,
    a."trfRegiao"                            AS "trfRegiao",
    TO_CHAR(DATE_TRUNC('month', s."dtBaixa"), 'YYYY-MM')  AS mes,
    (a."sei" IS NOT NULL)                    AS "redmineMatch"
  FROM sismat."SismatSaida" s
  ${SEI_LATERAL}
  LEFT JOIN sismat."RedmineSeiAtributos" a
    ON a."sei" = sei_ext.sei_norm
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
  autor: string;
  trfRegiao: number | null;
  mes: string | null;      // 'YYYY-MM' ou null (dtBaixa nula)
  redmineMatch: boolean;   // true quando o SEI casou com RedmineSeiAtributos
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

/** Ponto de uma série temporal mensal. */
export interface PontoSerie {
  mes: string; // 'YYYY-MM'
  valor: number;
}

/** Cobertura de mapeamento para um indicador. */
export interface CoberturaIndicador {
  /** Saídas SISMAT com o campo relevante preenchido (ex.: OAB não-vazio). */
  linhasComChave: number;
  /** Saídas SISMAT que casaram com qualquer linha Redmine pelo SEI. */
  linhasRedmine: number;
}

/** Resultado de HHI global (escala 0–10.000). */
export interface HhiResult extends CoberturaIndicador {
  hhi: number;       // 0–10.000
  entidades: number; // nº de entidades distintas com valor > 0
}

/** Resultado de valor médio por entidade. */
export interface MediaResult extends CoberturaIndicador {
  valor: number; // R$ médio por entidade distinta
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
  topMed: RankItem[]; // Top 20 medicamentos por valor (mantido internamente mas não exibido)
  porCrm: RankItem[]; // Top 15 CRM por valor
  porOab: RankItem[]; // Top 15 OAB por valor
  porGrupo: RankItem[];
  porRegiao: RankItem[];
  porForma: RankItem[];
  porSabast: RankItem[];
  opcoes: Record<SaidasRedmineFiltro, FiltroOpcao[]>;
  hasData: boolean;
  /** Total de saídas SISMAT que casaram com alguma linha Redmine. */
  linhasRedmineMapeadas: number;
  // ── Indicadores globais (referência) ─────────────────────────────────────
  hhiOab: HhiResult;
  hhiCrm: HhiResult;
  hhiTribunal: HhiResult;
  valorMedioProcesso: MediaResult;
  valorMedioPaciente: MediaResult;
  // ── Indicadores do último trimestre (exibidos nos cards) ─────────────────
  hhiOabRecente: HhiResult;
  hhiCrmRecente: HhiResult;
  hhiTribunalRecente: HhiResult;
  valorMedioProcessoRecente: MediaResult;
  valorMedioPacienteRecente: MediaResult;
  // ── Séries temporais (para popup) ────────────────────────────────────────
  hhiOabSerie: PontoSerie[];
  hhiCrmSerie: PontoSerie[];
  hhiTribunalSerie: PontoSerie[];
  valorMedioProcessoSerie: PontoSerie[];
  valorMedioPacienteSerie: PontoSerie[];
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

// ── HHI ──────────────────────────────────────────────────────────────────────

/**
 * Índice de Herfindahl-Hirschman normalizado (0–1).
 *   HHI = Σ s_i²  onde  s_i = valor_i / total
 * Entidades com valor ≤ 0 são ignoradas.
 * Retorna 0 quando não há entidades.
 */
function calcHhi(mapaValor: Map<string, number>): Pick<HhiResult, "hhi" | "entidades"> {
  let total = 0;
  for (const v of mapaValor.values()) if (v > 0) total += v;
  if (total === 0) return { hhi: 0, entidades: 0 };

  let hhi = 0;
  let entidades = 0;
  for (const v of mapaValor.values()) {
    if (v <= 0) continue;
    entidades++;
    const s = v / total;
    hhi += s * s;
  }
  // Escala padrão: 0–10.000 (participações em % ao quadrado)
  return { hhi: hhi * 10_000, entidades };
}

/** Agrega valor por chave de entidade a partir das saídas. */
function mapaEntidade(
  rows: SaidaRedmineRow[],
  chave: (r: SaidaRedmineRow) => string | null
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = chave(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + r.valor);
  }
  return m;
}

/** HHI global para uma extração de chave, com cobertura de mapeamento. */
function hhiDe(
  rows: SaidaRedmineRow[],
  chave: (r: SaidaRedmineRow) => string | null,
  linhasRedmine: number
): HhiResult {
  let linhasComChave = 0;
  for (const r of rows) if (chave(r) !== null) linhasComChave++;
  return { ...calcHhi(mapaEntidade(rows, chave)), linhasComChave, linhasRedmine };
}

// ── Séries temporais mensais ──────────────────────────────────────────────────

/** Agrupa saídas por mês (filtra linhas sem dtBaixa). */
function porMes(rows: SaidaRedmineRow[]): Map<string, SaidaRedmineRow[]> {
  const m = new Map<string, SaidaRedmineRow[]>();
  for (const r of rows) {
    if (!r.mes) continue;
    let lista = m.get(r.mes);
    if (!lista) { lista = []; m.set(r.mes, lista); }
    lista.push(r);
  }
  return m;
}

/**
 * Série mensal de HHI com janela móvel de `janela` meses.
 * Cada ponto M usa saídas dos últimos `janela` meses (inclusive M).
 */
function hhiSerie(
  rows: SaidaRedmineRow[],
  chave: (r: SaidaRedmineRow) => string | null,
  janela = 3
): PontoSerie[] {
  const grupos = porMes(rows);
  const meses = Array.from(grupos.keys()).sort();
  return meses.map((mes, i) => {
    const fatia = meses.slice(Math.max(0, i - janela + 1), i + 1);
    const linhas = fatia.flatMap((m) => grupos.get(m) ?? []);
    return { mes, valor: calcHhi(mapaEntidade(linhas, chave)).hhi };
  });
}

/**
 * Série mensal de valor médio por entidade distinta com janela móvel de `janela` meses.
 * Cada ponto M usa saídas dos últimos `janela` meses (inclusive M).
 */
function mediaSerie(
  rows: SaidaRedmineRow[],
  chave: (r: SaidaRedmineRow) => string | null,
  janela = 3
): PontoSerie[] {
  const grupos = porMes(rows);
  const meses = Array.from(grupos.keys()).sort();
  return meses.map((mes, i) => {
    const fatia = meses.slice(Math.max(0, i - janela + 1), i + 1);
    const linhas = fatia.flatMap((m) => grupos.get(m) ?? []);
    const m = mapaEntidade(linhas, chave);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    return { mes, valor: m.size > 0 ? total / m.size : 0 };
  });
}

/** Valor médio por entidade distinta, com cobertura de mapeamento. */
function mediaDe(
  rows: SaidaRedmineRow[],
  chave: (r: SaidaRedmineRow) => string | null,
  linhasRedmine: number
): MediaResult {
  let linhasComChave = 0;
  for (const r of rows) if (chave(r) !== null) linhasComChave++;
  const m = mapaEntidade(rows, chave);
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  return { valor: m.size > 0 ? total / m.size : 0, linhasComChave, linhasRedmine };
}

// ── Extratores de chave ───────────────────────────────────────────────────────

const chaveOab = (r: SaidaRedmineRow) => r.oab || null;
const chaveCrm = (r: SaidaRedmineRow) => r.crm || null;
const chaveTribunal = (r: SaidaRedmineRow) =>
  r.trfRegiao != null ? `TRF${r.trfRegiao}` : null;
/**
 * Para "valor médio por processo do Redmine": só conta linhas que de fato
 * casaram com um registro Redmine pelo SEI. Evita que linhas com NUP
 * extraído mas sem match inflacionem o denominador de cobertura (> 100%).
 */
const chaveProcessoRedmine = (r: SaidaRedmineRow) =>
  r.redmineMatch && r.sei ? r.sei : null;
const chaveAutor = (r: SaidaRedmineRow) => r.autor || null;

// ── Janela mais recente ───────────────────────────────────────────────────────

/**
 * Retorna as linhas dos últimos `janela` meses com dados presentes.
 * Usa os meses com dtBaixa preenchida, ordenados — ignora linhas sem data.
 */
function maisRecentes(rows: SaidaRedmineRow[], janela = 3): SaidaRedmineRow[] {
  const meses = [...new Set(rows.filter((r) => r.mes).map((r) => r.mes!))].sort();
  if (meses.length === 0) return [];
  const ultimos = new Set(meses.slice(-janela));
  return rows.filter((r) => r.mes != null && ultimos.has(r.mes));
}

// ── Consultas ─────────────────────────────────────────────────────────────────

/** Agregados globais (gráficos estáticos + opções de filtro). Cacheável. */
export async function getSaidasRedmineOverview(): Promise<SaidasRedmineOverview> {
  const rows = await db.$queryRaw<SaidaRedmineRow[]>(BASE_SELECT);

  const linhasRedmine = rows.filter((r) => r.redmineMatch).length;

  // Linhas dos últimos 3 meses com dados — base dos valores exibidos nos cards.
  const rowsRecentes = maisRecentes(rows, 3);
  const linhasRedmineRecente = rowsRecentes.filter((r) => r.redmineMatch).length;

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
    linhasRedmineMapeadas: linhasRedmine,
    // HHI + médias globais (referência)
    hhiOab: hhiDe(rows, chaveOab, linhasRedmine),
    hhiCrm: hhiDe(rows, chaveCrm, linhasRedmine),
    hhiTribunal: hhiDe(rows, chaveTribunal, linhasRedmine),
    valorMedioProcesso: mediaDe(rows, chaveProcessoRedmine, rows.length),
    valorMedioPaciente: mediaDe(rows, chaveAutor, linhasRedmine),
    // HHI + médias do último trimestre (exibidos nos cards)
    hhiOabRecente: hhiDe(rowsRecentes, chaveOab, linhasRedmineRecente),
    hhiCrmRecente: hhiDe(rowsRecentes, chaveCrm, linhasRedmineRecente),
    hhiTribunalRecente: hhiDe(rowsRecentes, chaveTribunal, linhasRedmineRecente),
    valorMedioProcessoRecente: mediaDe(rowsRecentes, chaveProcessoRedmine, rowsRecentes.length),
    valorMedioPacienteRecente: mediaDe(rowsRecentes, chaveAutor, linhasRedmineRecente),
    // Séries temporais
    hhiOabSerie: hhiSerie(rows, chaveOab),
    hhiCrmSerie: hhiSerie(rows, chaveCrm),
    hhiTribunalSerie: hhiSerie(rows, chaveTribunal),
    valorMedioProcessoSerie: mediaSerie(rows, chaveProcessoRedmine),
    valorMedioPacienteSerie: mediaSerie(rows, chaveAutor),
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
