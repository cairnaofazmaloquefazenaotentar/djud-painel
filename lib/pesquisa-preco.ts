import type { CatmatItem, CmedRegistro, PrecoCmed, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Pesquisa de Preços — lógica compartilhada pela rota de busca
// (/api/precos/buscar), pelas rotas de apoio aos filtros (/api/precos/catmat…)
// e pelo relatório IN 65/2021 (/api/relatorios/pesquisa-preco).
//
// A pesquisa é dirigida por TRÊS filtros obrigatórios:
//   1. Código do material — CATMAT (até 6 dígitos) ou Registro ANVISA (13 dígitos)
//   2. Descrição CATMAT   — vem do catálogo (CatmatItem), amarrada ao código
//   3. Unidade de fornecimento — normalizada entre as fontes (normalizarUnidade)
//
// Fontes e chave de cruzamento:
//   • CMED  — PrecoCmed (preço por EMBALAGEM) × CmedRegistro (registro ANVISA →
//             CATMAT, unidade de fornecimento, Qt_Embal). O preço é SEMPRE
//             convertido para a menor unidade de fornecimento: PMVG ÷ Qt_Embal.
//   • BPS   — PrecoBps.codigoCatmat ("BR0267140" ou "267140")
//   • SIASG — PrecoSiasg.codigoCatmat ("BR0267140"), só compras judiciais
//   • PNCP  — PrecoPncp.codItemCatalogo ("267140")
//   • ComprasGov — sismat.ComprasGovPreco não traz CATMAT: cruza pelo nome do
//             PDM do catálogo (material = nomePdm) + unidade. Como o PDM não
//             distingue dosagem, é INFORMATIVO e não entra no preço de referência.
//
// Metodologia (IN SEGES/ME nº 65/2021): por fonte, remoção de outliers (IQR) e
// mediana; preço de referência = mediana das medianas (BPS, SIASG, PNCP); o
// menor PMVG unitário sem impostos (CMED) é aplicado como teto.
// ─────────────────────────────────────────────────────────────────────────────

/** Tamanho da amostra (registros mais recentes) usada na estatística por fonte. */
const AMOSTRA = 500;
/** Registros devolvidos por fonte para exibição (painel e relatório). */
const REGISTROS_EXIBIDOS = 10;

/** Unidade sintética para registros ANVISA sem unidade de fornecimento na CMED. */
export const UNIDADE_EMBALAGEM = "EMBALAGEM";

// ── Normalização (espelhada em scripts/precos_norm.py — manter em sincronia) ──

/** Texto de busca: sem acentos, minúsculas, só [a-z0-9 ,-]. Mesma regra das rotas de preços. */
export function normalizarTexto(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Unidade de fornecimento comparável entre fontes. Idempotente.
 *   "Frasco 100,00 ML"        → "FRASCO 100 ML"   (PNCP/BPS)
 *   "FRASCO 100 ML"           → "FRASCO 100 ML"   (ComprasGov)
 *   "SERINGA 0,40 ML"         → "SERINGA 0,4 ML"
 *   "COMPRIMIDO - GENÉRICO"   → "COMPRIMIDO"      (BPS marca genérico na unidade)
 *   "UNIDADE 0,00"            → "UNIDADE"         (quantidade zero = não informada)
 */
export function normalizarUnidade(unidade: string | null | undefined): string {
  if (!unidade) return "";
  let s = String(unidade)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\s*-\s*GENERICO$/, "");
  s = s.replace(/(\d+),(\d+)/g, (_m, int: string, dec: string) => {
    const d = dec.replace(/0+$/, "");
    return d ? `${int},${d}` : int;
  });
  s = s.replace(/\s0$/, "");
  return s.replace(/\s+/g, " ").trim();
}

// ── Código do material ───────────────────────────────────────────────────────

export type TipoCodigo = "CATMAT" | "REGISTRO";

/**
 * Classifica o código digitado: CATMAT tem até 6 dígitos (aceita "BR0267140"),
 * registro ANVISA tem 13 (aceita pontuação "1.0180.0390.007-8").
 */
export function classificarCodigo(codigo: string): { tipo: TipoCodigo; codigo: string } | null {
  const digitos = String(codigo ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.length >= 9) return { tipo: "REGISTRO", codigo: digitos };
  if (digitos.length <= 7) {
    const semZeros = digitos.replace(/^0+/, "");
    return semZeros ? { tipo: "CATMAT", codigo: semZeros } : null;
  }
  return null;
}

/** Formas em que o CATMAT aparece em cada base de mercado. */
export function variantesCatmat(catmat: string) {
  const pad6 = catmat.padStart(6, "0");
  const br = `BR0${pad6}`;
  return {
    bps: Array.from(new Set([catmat, pad6, br])),
    siasg: [br],
    pncp: Array.from(new Set([catmat, pad6])),
  };
}

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface RegistroCmedResumo {
  registro: string;
  catmat: string | null;
  unidadeFornecimento: string | null;
  /** Unidade normalizada; UNIDADE_EMBALAGEM quando a CMED não informa. */
  unidadeNorm: string;
  qtEmbalagem: number | null;
  substancia: string | null;
  produto: string | null;
  apresentacao: string | null;
  fabricante: string | null;
  generico: boolean | null;
}

export interface ItemPesquisa {
  tipo: TipoCodigo;
  /** Código pesquisado (CATMAT sem zeros à esquerda ou registro de 13 dígitos). */
  codigo: string;
  catmat: string | null;
  /** Preenchido quando a pesquisa foi por registro ANVISA. */
  registro: string | null;
  descricao: string;
  nomePdm: string | null;
  codigoClasse: string | null;
  nomeClasse: string | null;
  /** Registros ANVISA (CMED) do item — todos os do CATMAT, ou só o pesquisado. */
  registros: RegistroCmedResumo[];
}

export type FonteMercado = "bps" | "siasg" | "pncp" | "comprasgov";

export interface UnidadeOpcao {
  /** Unidade normalizada — valor do filtro obrigatório. */
  unidade: string;
  total: number;
  fontes: Record<FonteMercado | "cmed", number>;
}

export interface SugestaoCatmat {
  codigo: string;
  descricao: string;
  nomePdm: string;
  codigoClasse: string;
  nomeClasse: string;
}

export interface SugestaoRegistro {
  registro: string;
  catmat: string | null;
  descricao: string;
  substancia: string | null;
  produto: string | null;
  apresentacao: string | null;
  fabricante: string | null;
  unidadeFornecimento: string | null;
  qtEmbalagem: number | null;
}

export interface Sugestoes {
  itens: SugestaoCatmat[];
  registros: SugestaoRegistro[];
}

export interface RegistroMercado {
  id: string | number;
  descricao: string;
  unidade: string | null;
  preco: number;
  qtd: number | null;
  data: string; // ISO
  uf: string | null;
  modalidade: string | null;
  orgao: string | null;
  fornecedor: string | null;
  esfera?: string | null;
  judicial?: string | null;
}

export interface FonteMercadoResultado {
  total: number;
  amostra: number;
  precoMin: number | null;
  precoMax: number | null;
  precoMediana: number | null;
  outliersRemovidos: number;
  registros: RegistroMercado[];
}

export interface RegistroCmedPreco {
  id: string;
  registro: string;
  substancia: string;
  produto: string;
  apresentacao: string;
  laboratorio: string | null;
  unidadeFornecimento: string | null;
  qtEmbalagem: number | null;
  /** PMVG sem impostos por EMBALAGEM (como consta na tabela CMED). */
  pmvgEmbalagem: number;
  /** PMVG sem impostos por UNIDADE de fornecimento (÷ Qt_Embal). */
  pmvgUnitario: number | null;
  pfEmbalagem: number | null;
  pfUnitario: number | null;
  cap: boolean;
  generico: boolean | null;
}

export interface CmedResultado {
  total: number;
  registros: RegistroCmedPreco[];
  pmvgUnitMin: number | null;
  pmvgUnitMax: number | null;
  /** Registros com preço mas sem Qt_Embal (preço só por embalagem). */
  semQtEmbalagem: number;
}

export interface Recomendacao {
  precoReferencia: number | null;
  limitePmvg: number | null;
  precoFinal: number | null;
  metodologia: string;
  fontes: string[];
  observacoes: string[];
}

export interface ResultadoPesquisa {
  item: ItemPesquisa;
  unidade: string;
  uf: string | null;
  resultados: {
    cmed: CmedResultado;
    bps: FonteMercadoResultado;
    siasg: FonteMercadoResultado;
    pncp: FonteMercadoResultado;
    comprasgov: FonteMercadoResultado;
  };
  recomendacao: Recomendacao;
}

export interface ParametrosPesquisa {
  codigo: string;
  unidade: string;
  uf?: string | null;
}

// ── Estatística ──────────────────────────────────────────────────────────────

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Remove outliers pelo intervalo interquartil (Q1−1,5·IQR; Q3+1,5·IQR). */
export function limparOutliers(valores: number[]): { limpo: number[]; removidos: number } {
  if (valores.length < 4) return { limpo: valores, removidos: 0 };
  const sorted = [...valores].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const limpo = sorted.filter((v) => v >= lo && v <= hi);
  return { limpo, removidos: sorted.length - limpo.length };
}

function consolidar(total: number, registros: RegistroMercado[], amostra: number): FonteMercadoResultado {
  const { limpo, removidos } = limparOutliers(registros.map((r) => r.preco).filter((v) => v > 0));
  return {
    total,
    amostra,
    precoMin: limpo.length ? Math.min(...limpo) : null,
    precoMax: limpo.length ? Math.max(...limpo) : null,
    precoMediana: mediana(limpo),
    outliersRemovidos: removidos,
    registros: registros.slice(0, REGISTROS_EXIBIDOS),
  };
}

// ── Resolução do item ────────────────────────────────────────────────────────

function resumoRegistro(r: CmedRegistro): RegistroCmedResumo {
  return {
    registro: r.registro,
    catmat: r.catmat,
    unidadeFornecimento: r.unidadeFornecimento,
    unidadeNorm: r.unidadeNorm || UNIDADE_EMBALAGEM,
    qtEmbalagem: r.qtEmbalagem,
    substancia: r.substancia,
    produto: r.produto,
    apresentacao: r.apresentacao,
    fabricante: r.fabricante,
    generico: r.generico,
  };
}

function descricaoDoRegistro(r: {
  substancia: string | null;
  produto: string | null;
  apresentacao: string | null;
}): string {
  return (
    [r.substancia, r.produto, r.apresentacao].filter(Boolean).join(" — ") ||
    "Registro ANVISA sem descrição"
  );
}

/** Resolve CATMAT ou registro ANVISA para o item da pesquisa; null se não existir. */
export async function resolverItem(codigoBruto: string): Promise<ItemPesquisa | null> {
  const cls = classificarCodigo(codigoBruto);
  if (!cls) return null;

  if (cls.tipo === "REGISTRO") {
    const reg = await db.cmedRegistro.findUnique({ where: { registro: cls.codigo } });
    if (!reg) return null;
    const catmatItem = reg.catmat
      ? await db.catmatItem.findUnique({ where: { codigoItem: reg.catmat } })
      : null;
    return {
      tipo: "REGISTRO",
      codigo: cls.codigo,
      catmat: reg.catmat,
      registro: reg.registro,
      descricao: catmatItem?.descricaoItem ?? reg.descricaoCatmat ?? descricaoDoRegistro(reg),
      nomePdm: catmatItem?.nomePdm ?? null,
      codigoClasse: catmatItem?.codigoClasse ?? null,
      nomeClasse: catmatItem?.nomeClasse ?? null,
      registros: [resumoRegistro(reg)],
    };
  }

  const [catmatItem, regs] = await Promise.all([
    db.catmatItem.findUnique({ where: { codigoItem: cls.codigo } }),
    db.cmedRegistro.findMany({
      where: { catmat: cls.codigo },
      orderBy: [{ substancia: "asc" }, { produto: "asc" }, { registro: "asc" }],
    }),
  ]);
  if (!catmatItem && regs.length === 0) return null;

  return {
    tipo: "CATMAT",
    codigo: cls.codigo,
    catmat: cls.codigo,
    registro: null,
    descricao:
      catmatItem?.descricaoItem ?? regs[0]?.descricaoCatmat ?? descricaoDoRegistro(regs[0]),
    nomePdm: catmatItem?.nomePdm ?? null,
    codigoClasse: catmatItem?.codigoClasse ?? null,
    nomeClasse: catmatItem?.nomeClasse ?? null,
    registros: regs.map(resumoRegistro),
  };
}

// ── Sugestões (typeahead dos filtros código/descrição) ───────────────────────

function sugestaoItem(i: CatmatItem): SugestaoCatmat {
  return {
    codigo: i.codigoItem,
    descricao: i.descricaoItem,
    nomePdm: i.nomePdm,
    codigoClasse: i.codigoClasse,
    nomeClasse: i.nomeClasse,
  };
}

function sugestaoRegistro(r: CmedRegistro): SugestaoRegistro {
  return {
    registro: r.registro,
    catmat: r.catmat,
    descricao: r.descricaoCatmat ?? descricaoDoRegistro(r),
    substancia: r.substancia,
    produto: r.produto,
    apresentacao: r.apresentacao,
    fabricante: r.fabricante,
    unidadeFornecimento: r.unidadeFornecimento,
    qtEmbalagem: r.qtEmbalagem,
  };
}

const semItens = (): Promise<CatmatItem[]> => Promise.resolve([]);
const semRegistros = (): Promise<CmedRegistro[]> => Promise.resolve([]);

export async function sugerirMateriais(q: string): Promise<Sugestoes> {
  const termo = q.trim();
  if (termo.length < 2) return { itens: [], registros: [] };

  const somenteDigitos = /^\d+$/.test(termo.replace(/^BR/i, "").replace(/[.\-\s]/g, ""));
  const digitos = termo.replace(/\D/g, "");

  if (somenteDigitos && digitos) {
    const catmatPrefixo = digitos.replace(/^0+/, "");
    const buscarItens = (): Promise<CatmatItem[]> =>
      catmatPrefixo && catmatPrefixo.length <= 6
        ? db.catmatItem.findMany({
            where: { codigoItem: { startsWith: catmatPrefixo } },
            orderBy: { codigoItem: "asc" },
            take: 20,
          })
        : semItens();
    const buscarRegistros = (): Promise<CmedRegistro[]> =>
      digitos.length >= 4
        ? db.cmedRegistro.findMany({
            where: { registro: { startsWith: digitos } },
            orderBy: { registro: "asc" },
            take: 20,
          })
        : semRegistros();
    const [itens, registros] = await Promise.all([buscarItens(), buscarRegistros()]);
    return { itens: itens.map(sugestaoItem), registros: registros.map(sugestaoRegistro) };
  }

  // Descrição: todas as palavras precisam ocorrer, em qualquer ordem — no
  // catálogo "insulina glargina" está como "INSULINA, TIPO: GLARGINA, …".
  const palavras = normalizarTexto(termo)
    .split(" ")
    .map((p) => p.replace(/^[,\-]+|[,\-]+$/g, ""))
    .filter((p) => p.length >= 2);
  if (palavras.length === 0) return { itens: [], registros: [] };
  const [itens, registros] = await Promise.all([
    db.catmatItem.findMany({
      where: { AND: palavras.map((p) => ({ descricaoNorm: { contains: p } })) },
      orderBy: [{ codigoClasse: "asc" }, { descricaoItem: "asc" }],
      take: 30,
    }),
    db.cmedRegistro.findMany({
      where: {
        OR: [
          { produto: { contains: termo, mode: "insensitive" } },
          { substancia: { contains: termo, mode: "insensitive" } },
        ],
      },
      orderBy: [{ substancia: "asc" }, { produto: "asc" }],
      take: 10,
    }),
  ]);
  return { itens: itens.map(sugestaoItem), registros: registros.map(sugestaoRegistro) };
}

// ── Unidades de fornecimento disponíveis ─────────────────────────────────────

interface MapaUnidades {
  opcoes: UnidadeOpcao[];
  /** unidade normalizada → valores brutos por fonte (filtro por igualdade no banco). */
  brutas: Record<FonteMercado, Map<string, string[]>>;
}

interface GrupoUnidade {
  unidade: string | null;
  _count: { _all: number };
}

const semGrupos = (): Promise<GrupoUnidade[]> => Promise.resolve([]);

export async function mapearUnidades(item: ItemPesquisa): Promise<MapaUnidades> {
  const variantes = item.catmat ? variantesCatmat(item.catmat) : null;
  const nomePdm = item.nomePdm;
  const registrosIds = item.registros.map((r) => r.registro);

  const gruposBps = (): Promise<GrupoUnidade[]> =>
    variantes
      ? db.precoBps.groupBy({
          by: ["unidade"],
          where: { codigoCatmat: { in: variantes.bps } },
          _count: { _all: true },
        })
      : semGrupos();
  const gruposSiasg = (): Promise<GrupoUnidade[]> =>
    variantes
      ? db.precoSiasg.groupBy({
          by: ["unidade"],
          where: { codigoCatmat: { in: variantes.siasg }, acaoJudicial: true },
          _count: { _all: true },
        })
      : semGrupos();
  const gruposPncp = (): Promise<GrupoUnidade[]> =>
    variantes
      ? db.precoPncp.groupBy({
          by: ["unidade"],
          where: { codItemCatalogo: { in: variantes.pncp } },
          _count: { _all: true },
        })
      : semGrupos();
  const gruposCg = (): Promise<GrupoUnidade[]> =>
    nomePdm
      ? db.comprasGovPreco.groupBy({
          by: ["unidade"],
          where: { material: { equals: nomePdm, mode: "insensitive" } },
          _count: { _all: true },
        })
      : semGrupos();
  const registrosComPreco = (): Promise<{ registro: string | null }[]> =>
    registrosIds.length
      ? db.precoCmed.findMany({
          where: { registro: { in: registrosIds } },
          select: { registro: true },
        })
      : Promise.resolve([]);

  const [bps, siasg, pncp, comprasgov, cmedComPreco] = await Promise.all([
    gruposBps(),
    gruposSiasg(),
    gruposPncp(),
    gruposCg(),
    registrosComPreco(),
  ]);

  const brutas: MapaUnidades["brutas"] = {
    bps: new Map(),
    siasg: new Map(),
    pncp: new Map(),
    comprasgov: new Map(),
  };
  const opcoes = new Map<string, UnidadeOpcao>();

  const somar = (fonte: FonteMercado | "cmed", unidadeNorm: string, n: number) => {
    if (!unidadeNorm || n <= 0) return;
    const atual = opcoes.get(unidadeNorm) ?? {
      unidade: unidadeNorm,
      total: 0,
      fontes: { cmed: 0, bps: 0, siasg: 0, pncp: 0, comprasgov: 0 },
    };
    atual.total += n;
    atual.fontes[fonte] += n;
    opcoes.set(unidadeNorm, atual);
  };

  const registrar = (fonte: FonteMercado, grupos: GrupoUnidade[]) => {
    for (const g of grupos) {
      if (g.unidade == null) continue;
      const norm = normalizarUnidade(g.unidade);
      if (!norm) continue;
      const lista = brutas[fonte].get(norm) ?? [];
      lista.push(g.unidade);
      brutas[fonte].set(norm, lista);
      somar(fonte, norm, g._count._all);
    }
  };

  registrar("bps", bps);
  registrar("siasg", siasg);
  registrar("pncp", pncp);
  registrar("comprasgov", comprasgov);

  const comPreco = new Set(cmedComPreco.map((r) => r.registro));
  for (const r of item.registros) {
    if (comPreco.has(r.registro)) somar("cmed", r.unidadeNorm, 1);
  }

  return {
    opcoes: Array.from(opcoes.values()).sort(
      (a, b) => b.total - a.total || a.unidade.localeCompare(b.unidade, "pt-BR")
    ),
    brutas,
  };
}

// ── Pesquisa consolidada ─────────────────────────────────────────────────────

interface LinhaBps {
  id: string;
  descricao: string;
  preco: number;
  qtd: number;
  unidade: string | null;
  data: Date;
  uf: string | null;
  modalidade: string | null;
  instituicao: string | null;
  fornecedor: string | null;
}

interface LinhaSiasg {
  id: string;
  descricao: string;
  preco: number;
  qtd: number;
  unidade: string | null;
  data: Date;
  uf: string | null;
  modalidade: string | null;
  orgao: string | null;
  fornecedor: string | null;
  esfera: string | null;
}

interface LinhaPncp {
  id: string;
  descricaoResumida: string;
  valorUnitResultado: number;
  quantidade: number | null;
  unidade: string | null;
  data: Date;
  uf: string | null;
  modalidade: string | null;
  orgao: string | null;
  fornecedor: string | null;
}

interface LinhaComprasGov {
  id: number;
  material: string;
  unidade: string;
  esfera: string;
  modalidade: string;
  judicial: string;
  dtCompra: Date;
  quantidade: number;
  precoUnitario: Prisma.Decimal;
}

const toISO = (d: Date) => d.toISOString();

export async function pesquisarPrecos(p: ParametrosPesquisa): Promise<ResultadoPesquisa | null> {
  const item = await resolverItem(p.codigo);
  if (!item) return null;

  const unidade = normalizarUnidade(p.unidade) || UNIDADE_EMBALAGEM;
  const uf = p.uf ? p.uf.toUpperCase() : null;
  const { brutas } = await mapearUnidades(item);
  const variantes = item.catmat ? variantesCatmat(item.catmat) : null;
  const nomePdm = item.nomePdm;

  const brutasBps = brutas.bps.get(unidade) ?? [];
  const brutasSiasg = brutas.siasg.get(unidade) ?? [];
  const brutasPncp = brutas.pncp.get(unidade) ?? [];
  const brutasCg = brutas.comprasgov.get(unidade) ?? [];

  const whereBps: Prisma.PrecoBpsWhereInput | null =
    variantes && brutasBps.length
      ? { codigoCatmat: { in: variantes.bps }, unidade: { in: brutasBps }, ...(uf ? { uf } : {}) }
      : null;
  const whereSiasg: Prisma.PrecoSiasgWhereInput | null =
    variantes && brutasSiasg.length
      ? {
          codigoCatmat: { in: variantes.siasg },
          unidade: { in: brutasSiasg },
          acaoJudicial: true,
          ...(uf ? { uf } : {}),
        }
      : null;
  const wherePncp: Prisma.PrecoPncpWhereInput | null =
    variantes && brutasPncp.length
      ? { codItemCatalogo: { in: variantes.pncp }, unidade: { in: brutasPncp }, ...(uf ? { uf } : {}) }
      : null;
  const whereCg: Prisma.ComprasGovPrecoWhereInput | null =
    nomePdm && brutasCg.length
      ? { material: { equals: nomePdm, mode: "insensitive" }, unidade: { in: brutasCg } }
      : null;

  // Registros ANVISA da unidade escolhida (a CMED é filtrada pela unidade do registro).
  const porRegistro = new Map(item.registros.map((r) => [r.registro, r]));
  const registrosDaUnidade = item.registros
    .filter((r) => r.unidadeNorm === unidade)
    .map((r) => r.registro);

  const buscarBps = (): Promise<LinhaBps[]> =>
    whereBps
      ? db.precoBps.findMany({
          where: whereBps,
          orderBy: { data: "desc" },
          take: AMOSTRA,
          select: {
            id: true,
            descricao: true,
            preco: true,
            qtd: true,
            unidade: true,
            data: true,
            uf: true,
            modalidade: true,
            instituicao: true,
            fornecedor: true,
          },
        })
      : Promise.resolve([]);
  const buscarSiasg = (): Promise<LinhaSiasg[]> =>
    whereSiasg
      ? db.precoSiasg.findMany({
          where: whereSiasg,
          orderBy: { data: "desc" },
          take: AMOSTRA,
          select: {
            id: true,
            descricao: true,
            preco: true,
            qtd: true,
            unidade: true,
            data: true,
            uf: true,
            modalidade: true,
            orgao: true,
            fornecedor: true,
            esfera: true,
          },
        })
      : Promise.resolve([]);
  const buscarPncp = (): Promise<LinhaPncp[]> =>
    wherePncp
      ? db.precoPncp.findMany({
          where: wherePncp,
          orderBy: { data: "desc" },
          take: AMOSTRA,
          select: {
            id: true,
            descricaoResumida: true,
            valorUnitResultado: true,
            quantidade: true,
            unidade: true,
            data: true,
            uf: true,
            modalidade: true,
            orgao: true,
            fornecedor: true,
          },
        })
      : Promise.resolve([]);
  const buscarCg = (): Promise<LinhaComprasGov[]> =>
    whereCg
      ? db.comprasGovPreco.findMany({
          where: whereCg,
          orderBy: { dtCompra: "desc" },
          take: AMOSTRA,
          select: {
            id: true,
            material: true,
            unidade: true,
            esfera: true,
            modalidade: true,
            judicial: true,
            dtCompra: true,
            quantidade: true,
            precoUnitario: true,
          },
        })
      : Promise.resolve([]);
  const buscarCmed = (): Promise<PrecoCmed[]> =>
    registrosDaUnidade.length
      ? db.precoCmed.findMany({
          where: { registro: { in: registrosDaUnidade } },
          orderBy: [{ substancia: "asc" }, { produto: "asc" }, { apresentacao: "asc" }],
        })
      : Promise.resolve([]);
  const contar = (fn: () => Promise<number>, ativo: boolean): Promise<number> =>
    ativo ? fn() : Promise.resolve(0);

  const [bpsRows, siasgRows, pncpRows, cgRows, cmedRows, totalBps, totalSiasg, totalPncp, totalCg] =
    await Promise.all([
      buscarBps(),
      buscarSiasg(),
      buscarPncp(),
      buscarCg(),
      buscarCmed(),
      contar(() => db.precoBps.count({ where: whereBps ?? undefined }), !!whereBps),
      contar(() => db.precoSiasg.count({ where: whereSiasg ?? undefined }), !!whereSiasg),
      contar(() => db.precoPncp.count({ where: wherePncp ?? undefined }), !!wherePncp),
      contar(() => db.comprasGovPreco.count({ where: whereCg ?? undefined }), !!whereCg),
    ]);

  const bps = consolidar(
    totalBps,
    bpsRows.map((r) => ({
      id: r.id,
      descricao: r.descricao,
      unidade: r.unidade,
      preco: r.preco,
      qtd: r.qtd,
      data: toISO(r.data),
      uf: r.uf,
      modalidade: r.modalidade,
      orgao: r.instituicao,
      fornecedor: r.fornecedor,
    })),
    bpsRows.length
  );
  const siasg = consolidar(
    totalSiasg,
    siasgRows.map((r) => ({
      id: r.id,
      descricao: r.descricao,
      unidade: r.unidade,
      preco: r.preco,
      qtd: r.qtd,
      data: toISO(r.data),
      uf: r.uf,
      modalidade: r.modalidade,
      orgao: r.orgao,
      fornecedor: r.fornecedor,
      esfera: r.esfera,
    })),
    siasgRows.length
  );
  const pncp = consolidar(
    totalPncp,
    pncpRows.map((r) => ({
      id: r.id,
      descricao: r.descricaoResumida,
      unidade: r.unidade,
      preco: r.valorUnitResultado,
      qtd: r.quantidade,
      data: toISO(r.data),
      uf: r.uf,
      modalidade: r.modalidade,
      orgao: r.orgao,
      fornecedor: r.fornecedor,
    })),
    pncpRows.length
  );
  const comprasgov = consolidar(
    totalCg,
    cgRows.map((r) => ({
      id: r.id,
      descricao: r.material,
      unidade: r.unidade,
      preco: Number(r.precoUnitario),
      qtd: r.quantidade,
      data: toISO(r.dtCompra),
      uf: null,
      modalidade: r.modalidade,
      orgao: null,
      fornecedor: null,
      esfera: r.esfera,
      judicial: r.judicial,
    })),
    cgRows.length
  );

  // CMED: preço por embalagem → por unidade de fornecimento (÷ Qt_Embal).
  const cmedRegistros: RegistroCmedPreco[] = cmedRows.map((r) => {
    const meta = r.registro ? porRegistro.get(r.registro) : undefined;
    const qt =
      unidade === UNIDADE_EMBALAGEM
        ? 1
        : meta?.qtEmbalagem && meta.qtEmbalagem > 0
          ? meta.qtEmbalagem
          : null;
    const porUnidade = (v: number | null) => (v != null && qt ? v / qt : null);
    return {
      id: r.id,
      registro: r.registro ?? "",
      substancia: r.substancia,
      produto: r.produto,
      apresentacao: r.apresentacao,
      laboratorio: r.laboratorio,
      unidadeFornecimento: meta?.unidadeFornecimento ?? null,
      qtEmbalagem: qt,
      pmvgEmbalagem: r.pmvgSemImpostos,
      pmvgUnitario: porUnidade(r.pmvgSemImpostos),
      pfEmbalagem: r.pf0,
      pfUnitario: porUnidade(r.pf0),
      cap: r.cap,
      generico: meta?.generico ?? null,
    };
  });
  const pmvgUnitarios = cmedRegistros
    .map((r) => r.pmvgUnitario)
    .filter((v): v is number => v != null && v > 0);
  const cmed: CmedResultado = {
    total: cmedRegistros.length,
    registros: cmedRegistros,
    pmvgUnitMin: pmvgUnitarios.length ? Math.min(...pmvgUnitarios) : null,
    pmvgUnitMax: pmvgUnitarios.length ? Math.max(...pmvgUnitarios) : null,
    semQtEmbalagem: cmedRegistros.filter((r) => r.pmvgUnitario == null).length,
  };

  // ── Recomendação (IN 65/2021) ──
  const fontes: string[] = [];
  const medianas: number[] = [];
  if (bps.precoMediana !== null) {
    fontes.push("BPS");
    medianas.push(bps.precoMediana);
  }
  if (siasg.precoMediana !== null) {
    fontes.push("SIASG");
    medianas.push(siasg.precoMediana);
  }
  if (pncp.precoMediana !== null) {
    fontes.push("PNCP");
    medianas.push(pncp.precoMediana);
  }

  const precoReferencia = mediana(medianas);
  const limitePmvg = cmed.pmvgUnitMin;
  const pmvgAplicado =
    limitePmvg !== null && precoReferencia !== null && precoReferencia > limitePmvg;
  const precoFinal = pmvgAplicado ? limitePmvg : (precoReferencia ?? limitePmvg);
  const capAplica = cmedRegistros.some((r) => r.cap);

  const observacoes: string[] = [];
  if (item.tipo === "REGISTRO" && !item.catmat) {
    observacoes.push(
      "Registro ANVISA sem CATMAT associado: as bases de mercado (BPS, SIASG, PNCP) não podem ser consultadas por código. Resultado limitado ao preço CMED."
    );
  }
  if (pmvgAplicado && precoReferencia !== null && limitePmvg !== null) {
    observacoes.push(
      `Preço de referência (R$ ${precoReferencia.toFixed(4)}) supera o menor PMVG unitário sem impostos (R$ ${limitePmvg.toFixed(4)}). PMVG aplicado como teto.`
    );
  }
  if (capAplica) {
    observacoes.push(
      "Produto sujeito ao desconto CAP de 21,53% sobre o PF nas aquisições não judiciais."
    );
  }
  if (cmed.semQtEmbalagem > 0) {
    observacoes.push(
      `${cmed.semQtEmbalagem} registro(s) CMED sem quantidade por embalagem informada: preço exibido por embalagem e não considerado no teto.`
    );
  }
  if (fontes.length < 3) {
    observacoes.push(
      `Apenas ${fontes.length} fonte(s) de mercado com dados para este item e unidade. Recomenda-se busca adicional.`
    );
  }
  if (bps.total === 0 && siasg.total === 0 && pncp.total === 0) {
    observacoes.push(
      "Nenhum registro encontrado nas bases de mercado para este código e unidade de fornecimento."
    );
  }
  if (comprasgov.total > 0) {
    observacoes.push(
      `ComprasGov: ${comprasgov.total} compra(s) de "${nomePdm}" na unidade selecionada, cruzadas pelo nome do PDM (sem dosagem). Exibidas para referência; não entram no preço de referência.`
    );
  }

  return {
    item,
    unidade,
    uf,
    resultados: { cmed, bps, siasg, pncp, comprasgov },
    recomendacao: {
      precoReferencia,
      limitePmvg,
      precoFinal,
      metodologia:
        "Mediana das medianas por fonte (IN SEGES/ME nº 65/2021); teto = menor PMVG unitário sem impostos (CMED ÷ Qt_Embal)",
      fontes,
      observacoes,
    },
  };
}
