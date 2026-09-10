import type { CatmatItem, CmedRegistro, PrecoCmed, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  FONTE_SEM_CAMPO,
  NOME_FONTE,
  ROTULO_FILTRO,
  filtrosAtivos,
  normalizarFiltros,
  variantesCnpj,
  type CampoFiltro,
  type FiltrosOpcionais,
  type FonteMercado,
} from "@/lib/pesquisa-preco-filtros";
import {
  ESTATISTICAS_VAZIAS,
  METODO_ADOTADO,
  NOME_FONTE_CURADA,
  calcularEstatisticas,
  limitesIqr,
  mapaExclusoes,
  normalizarExclusoes,
  normalizarOrcamentos,
  type Estatisticas,
  type ExclusaoRegistro,
  type FonteCurada,
  type OrcamentoFornecedor,
  type RegistroDescartado,
} from "@/lib/pesquisa-preco-curadoria";

export * from "@/lib/pesquisa-preco-filtros";
export * from "@/lib/pesquisa-preco-curadoria";

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
//
// A base ComprasGov (sismat.ComprasGovPreco) NÃO entra aqui: ela não traz o
// código CATMAT, e o cruzamento possível seria pelo nome do PDM sem distinção
// de dosagem — incompatível com a exigência de pesquisar por código. Ela segue
// alimentando a aba "Preços" (lib/precos-metrics.ts).
//
// Metodologia (IN SEGES/ME nº 65/2021): por fonte, remoção de outliers (IQR) e
// apuração dos três métodos do art. 6º — média, mediana e menor valor. O preço
// de referência adotado é a mediana das medianas (BPS, SIASG, PNCP e orçamentos
// diretos); o menor PMVG unitário sem impostos (CMED) é aplicado como teto.
//
// Além dos números por fonte, a pesquisa devolve dois consolidados (art. 6º,
// "inclusive de forma consolidada"), que respondem a perguntas diferentes:
//   • POR FONTE   — cada base pesa igual: as estatísticas incidem sobre o vetor
//                   das medianas das fontes. É daqui que sai o preço adotado.
//   • POR REGISTRO — cada compra pesa igual: todos os registros das fontes são
//                   reunidos num conjunto único. Bases com muitos registros
//                   dominam o resultado, então serve de contraprova, não de
//                   preço adotado.
//
// Curadoria (lib/pesquisa-preco-curadoria.ts): registros podem ser
// desconsiderados com justificativa antes da emissão do relatório, e
// orçamentos diretos de fornecedor (art. 5º, IV) entram como fonte adicional.
//
// Nota de tipagem: as chamadas ao Prisma (groupBy/findMany/count) ficam sempre
// em `const` locais e NUNCA em posição de retorno de função com tipo declarado.
// Com tipo de retorno contextual o TypeScript tenta inferir os genéricos
// internos do Prisma (ex.: `InputErrors` do groupBy) a partir dele e quebra o
// build ("is not assignable to parameter of type ... & GrupoUnidade[]").
// ─────────────────────────────────────────────────────────────────────────────

/** Tamanho da amostra (registros mais recentes) usada na estatística por fonte. */
const AMOSTRA = 500;
/**
 * Registros devolvidos por fonte. São os mais recentes MAIS todos os
 * classificados como destoantes pelo IQR — sem esta segunda parte, justamente
 * os registros que a curadoria precisa examinar poderiam ficar de fora quando
 * a amostra chega aos 500. Painel e relatório recortam os primeiros para
 * exibição; a tela de curadoria usa a lista inteira.
 */
const REGISTROS_ANALISE = 150;

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
  /** Padrão Descritivo de Material do catálogo — exibição apenas. */
  nomePdm: string | null;
  codigoClasse: string | null;
  nomeClasse: string | null;
  /** Registros ANVISA (CMED) do item — todos os do CATMAT, ou só o pesquisado. */
  registros: RegistroCmedResumo[];
}

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
  id: string;
  descricao: string;
  unidade: string | null;
  preco: number;
  qtd: number | null;
  data: string; // ISO
  uf: string | null;
  modalidade: string | null;
  orgao: string | null;
  /** Empresa vencedora do certame — vai nominada no relatório. */
  fornecedor: string | null;
  cnpjFornecedor: string | null;
  /** Marca e fabricante do produto ofertado (nem toda base registra os dois). */
  marca: string | null;
  fabricante: string | null;
  esfera?: string | null;
  /** Fora da faixa Q1−1,5·IQR … Q3+1,5·IQR — já não entra na estatística. */
  outlierIqr: boolean;
  /** Justificativa do descarte manual; null quando o registro foi considerado. */
  excluidoPor: string | null;
}

export interface FonteMercadoResultado {
  /** Filtros opcionais que esta base não possui como campo — ver FONTE_SEM_CAMPO. */
  filtrosNaoSuportados: CampoFiltro[];
  total: number;
  amostra: number;
  /** Média, mediana e menor valor (art. 6º) sobre a amostra já depurada. */
  estatisticas: Estatisticas;
  outliersRemovidos: number;
  /** Registros desconsiderados manualmente nesta fonte. */
  excluidosManualmente: number;
  /** Amostra para exibição e curadoria — ver REGISTROS_ANALISE. */
  registros: RegistroMercado[];
}

/**
 * Consolidação das fontes pelos dois critérios possíveis. Ver o cabeçalho do
 * arquivo: `porFonte` é o que instrui o processo; `porRegistro` é contraprova.
 */
export interface Consolidado {
  /** Uma entrada por fonte com mediana apurada, na ordem de apresentação. */
  fontes: Array<{ fonte: FonteCurada; nome: string; estatisticas: Estatisticas }>;
  /** Medianas das fontes — o vetor sobre o qual `porFonte` é calculado. */
  medianasPorFonte: number[];
  /** Cada fonte pesa igual. `porFonte.mediana` é o preço de referência. */
  porFonte: Estatisticas;
  /** Cada registro pesa igual: todos os registros depurados reunidos. */
  porRegistro: Estatisticas;
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
  /** Justificativa do descarte manual; null quando o registro foi considerado. */
  excluidoPor: string | null;
}

export interface CmedResultado {
  total: number;
  registros: RegistroCmedPreco[];
  pmvgUnitMin: number | null;
  pmvgUnitMax: number | null;
  /** Registros com preço mas sem Qt_Embal (preço só por embalagem). */
  semQtEmbalagem: number;
  /** Registros de teto desconsiderados manualmente. */
  excluidosManualmente: number;
}

export interface Recomendacao {
  /** Mediana das medianas por fonte — o método adotado (art. 6º, caput). */
  precoReferencia: number | null;
  /** Os outros dois métodos do art. 6º, para conferência no relatório. */
  mediaConsolidada: number | null;
  menorConsolidado: number | null;
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
  /** Filtros opcionais já normalizados — o que de fato entrou na consulta. */
  filtros: FiltrosOpcionais;
  resultados: {
    cmed: CmedResultado;
    bps: FonteMercadoResultado;
    siasg: FonteMercadoResultado;
    pncp: FonteMercadoResultado;
    /** Cotações diretas informadas pelo usuário; null quando não há nenhuma. */
    orcamentos: FonteMercadoResultado | null;
  };
  consolidado: Consolidado;
  /** Orçamentos diretos como foram informados (inclusive os fora do cálculo). */
  orcamentos: OrcamentoFornecedor[];
  /** Registros desconsiderados e o motivo — rastreabilidade do descarte. */
  descartes: RegistroDescartado[];
  recomendacao: Recomendacao;
}

export interface ParametrosPesquisa {
  codigo: string;
  unidade: string;
  uf?: string | null;
  filtros?: Partial<FiltrosOpcionais> | null;
  /** Registros a desconsiderar, com justificativa (tela de curadoria). */
  exclusoes?: ExclusaoRegistro[] | unknown;
  /** Orçamentos diretos de fornecedor (art. 5º, IV). */
  orcamentos?: OrcamentoFornecedor[] | unknown;
}

/** Comparação tolerante a acento/caixa, usada nos filtros feitos em memória. */
function contemTexto(valor: string | null | undefined, termo: string): boolean {
  return normalizarTexto(String(valor ?? "")).includes(normalizarTexto(termo));
}

// ── Estatística e depuração da amostra ───────────────────────────────────────
//
// mediana(), calcularEstatisticas() e limitesIqr() vivem em
// lib/pesquisa-preco-curadoria.ts (módulo puro, reexportado acima) porque a
// tela precisa deles para pré-visualizar o efeito de uma exclusão.

interface OpcoesConsolidacao {
  fonte: FonteCurada;
  filtrosNaoSuportados?: CampoFiltro[];
  /** Exclusões manuais desta fonte: id do registro → justificativa. */
  excluidos?: Map<string, string>;
  /**
   * Orçamentos não passam por IQR: são poucos e foram escolhidos a dedo pelo
   * responsável — descartar um automaticamente contrariaria a própria juntada.
   */
  semIqr?: boolean;
}

interface AnaliseFonte {
  resultado: FonteMercadoResultado;
  /** Preços que compõem a estatística — alimentam o consolidado por registro. */
  precos: number[];
  descartes: RegistroDescartado[];
}

/** Registro como sai da base: `outlierIqr` e `excluidoPor` são decididos aqui. */
type RegistroBruto = Omit<RegistroMercado, "outlierIqr" | "excluidoPor">;

/**
 * Estatística de uma fonte a partir da amostra bruta. A ordem importa:
 * primeiro saem os registros desconsiderados à mão (com justificativa), depois
 * o IQR trabalha sobre o que sobrou — o contrário deixaria o IQR calibrado por
 * valores que o responsável já havia rejeitado.
 */
function consolidar(
  total: number,
  registros: RegistroBruto[],
  amostra: number,
  opcoes: OpcoesConsolidacao
): AnaliseFonte {
  const excluidos = opcoes.excluidos ?? new Map<string, string>();

  const marcados = registros.map((r) => ({ ...r, excluidoPor: excluidos.get(r.id) ?? null }));
  const considerados = marcados.filter((r) => r.excluidoPor === null && r.preco > 0);

  const descartes: RegistroDescartado[] = marcados
    .filter((r) => r.excluidoPor !== null)
    .map((r) => ({
      fonte: opcoes.fonte,
      id: r.id,
      descricao: r.descricao,
      preco: r.preco,
      data: r.data,
      uf: r.uf,
      fornecedor: r.fornecedor,
      motivo: r.excluidoPor as string,
    }));

  const precos = considerados.map((r) => r.preco);
  const limites = opcoes.semIqr ? null : limitesIqr(precos);
  const dentro = limites ? precos.filter((v) => v >= limites.lo && v <= limites.hi) : precos;

  const comOutlier: RegistroMercado[] = marcados.map((r) => ({
    ...r,
    outlierIqr:
      r.excluidoPor === null &&
      r.preco > 0 &&
      limites !== null &&
      (r.preco < limites.lo || r.preco > limites.hi),
  }));

  // A curadoria precisa ver todos os destoantes, mesmo os que caíram fora dos
  // REGISTROS_ANALISE mais recentes — são exatamente os candidatos a exclusão.
  const recentes = comOutlier.slice(0, REGISTROS_ANALISE);
  const jaListados = new Set(recentes.map((r) => r.id));
  const destoantes = comOutlier.filter((r) => r.outlierIqr && !jaListados.has(r.id));

  return {
    resultado: {
      filtrosNaoSuportados: opcoes.filtrosNaoSuportados ?? [],
      total,
      amostra,
      estatisticas: calcularEstatisticas(dentro),
      outliersRemovidos: precos.length - dentro.length,
      excluidosManualmente: descartes.length,
      registros: [...recentes, ...destoantes],
    },
    precos: dentro,
    descartes,
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

  const catmatItemPromise = db.catmatItem.findUnique({ where: { codigoItem: cls.codigo } });
  const regsPromise = db.cmedRegistro.findMany({
    where: { catmat: cls.codigo },
    orderBy: [{ substancia: "asc" }, { produto: "asc" }, { registro: "asc" }],
  });
  const [catmatItem, regs] = await Promise.all([catmatItemPromise, regsPromise]);
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

export async function sugerirMateriais(q: string): Promise<Sugestoes> {
  const termo = q.trim();
  if (termo.length < 2) return { itens: [], registros: [] };

  const somenteDigitos = /^\d+$/.test(termo.replace(/^BR/i, "").replace(/[.\-\s]/g, ""));
  const digitos = termo.replace(/\D/g, "");

  if (somenteDigitos && digitos) {
    const catmatPrefixo = digitos.replace(/^0+/, "");

    const buscarItens = async (): Promise<CatmatItem[]> => {
      if (!catmatPrefixo || catmatPrefixo.length > 6) return [];
      const rows = await db.catmatItem.findMany({
        where: { codigoItem: { startsWith: catmatPrefixo } },
        orderBy: { codigoItem: "asc" },
        take: 20,
      });
      return rows;
    };
    const buscarRegistros = async (): Promise<CmedRegistro[]> => {
      if (digitos.length < 4) return [];
      const rows = await db.cmedRegistro.findMany({
        where: { registro: { startsWith: digitos } },
        orderBy: { registro: "asc" },
        take: 20,
      });
      return rows;
    };

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

  const itensPromise = db.catmatItem.findMany({
    where: { AND: palavras.map((p) => ({ descricaoNorm: { contains: p } })) },
    orderBy: [{ codigoClasse: "asc" }, { descricaoItem: "asc" }],
    take: 30,
  });
  const registrosPromise = db.cmedRegistro.findMany({
    where: {
      OR: [
        { produto: { contains: termo, mode: "insensitive" } },
        { substancia: { contains: termo, mode: "insensitive" } },
      ],
    },
    orderBy: [{ substancia: "asc" }, { produto: "asc" }],
    take: 10,
  });
  const [itens, registros] = await Promise.all([itensPromise, registrosPromise]);
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

export async function mapearUnidades(item: ItemPesquisa): Promise<MapaUnidades> {
  const variantes = item.catmat ? variantesCatmat(item.catmat) : null;
  const registrosIds = item.registros.map((r) => r.registro);

  const gruposBps = async (): Promise<GrupoUnidade[]> => {
    if (!variantes) return [];
    const grupos = await db.precoBps.groupBy({
      by: ["unidade"],
      where: { codigoCatmat: { in: variantes.bps } },
      _count: { _all: true },
    });
    return grupos;
  };
  const gruposSiasg = async (): Promise<GrupoUnidade[]> => {
    if (!variantes) return [];
    const grupos = await db.precoSiasg.groupBy({
      by: ["unidade"],
      where: { codigoCatmat: { in: variantes.siasg }, acaoJudicial: true },
      _count: { _all: true },
    });
    return grupos;
  };
  const gruposPncp = async (): Promise<GrupoUnidade[]> => {
    if (!variantes) return [];
    const grupos = await db.precoPncp.groupBy({
      by: ["unidade"],
      where: { codItemCatalogo: { in: variantes.pncp } },
      _count: { _all: true },
    });
    return grupos;
  };
  const registrosComPreco = async (): Promise<string[]> => {
    if (!registrosIds.length) return [];
    const rows = await db.precoCmed.findMany({
      where: { registro: { in: registrosIds } },
      select: { registro: true },
    });
    return rows.map((r) => r.registro).filter((r): r is string => r != null);
  };

  const [bps, siasg, pncp, cmedComPreco] = await Promise.all([
    gruposBps(),
    gruposSiasg(),
    gruposPncp(),
    registrosComPreco(),
  ]);

  const brutas: MapaUnidades["brutas"] = {
    bps: new Map(),
    siasg: new Map(),
    pncp: new Map(),
  };
  const opcoes = new Map<string, UnidadeOpcao>();

  const somar = (fonte: FonteMercado | "cmed", unidadeNorm: string, n: number) => {
    if (!unidadeNorm || n <= 0) return;
    const atual = opcoes.get(unidadeNorm) ?? {
      unidade: unidadeNorm,
      total: 0,
      fontes: { cmed: 0, bps: 0, siasg: 0, pncp: 0 },
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

  const comPreco = new Set(cmedComPreco);
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
  cnpjFornecedor: string | null;
  fabricante: string | null;
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
  cnpjFornecedor: string | null;
  fabricante: string | null;
  marca: string | null;
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
  cnpjFornecedor: string | null;
}

const toISO = (d: Date) => d.toISOString();

export async function pesquisarPrecos(p: ParametrosPesquisa): Promise<ResultadoPesquisa | null> {
  const item = await resolverItem(p.codigo);
  if (!item) return null;

  const unidade = normalizarUnidade(p.unidade) || UNIDADE_EMBALAGEM;
  const uf = p.uf ? p.uf.toUpperCase() : null;
  const { brutas } = await mapearUnidades(item);
  const variantes = item.catmat ? variantesCatmat(item.catmat) : null;

  const brutasBps = brutas.bps.get(unidade) ?? [];
  const brutasSiasg = brutas.siasg.get(unidade) ?? [];
  const brutasPncp = brutas.pncp.get(unidade) ?? [];

  // ── Curadoria: exclusões justificadas e orçamentos diretos ──
  // Normalizados aqui e não na rota porque as três entradas (busca, relatório
  // de item e relatório da cesta) chamam esta função com corpos diferentes.
  const exclusoes: ExclusaoRegistro[] = normalizarExclusoes(p.exclusoes);
  const excluidosPorFonte = mapaExclusoes(exclusoes);
  const orcamentos: OrcamentoFornecedor[] = normalizarOrcamentos(p.orcamentos);

  // ── Filtros opcionais ──
  const filtros = normalizarFiltros(p.filtros);
  const ativos = filtrosAtivos(filtros);
  /** Filtros ativos que a fonte não tem como campo — bloqueiam a consulta dela. */
  const semCampo = (fonte: FonteMercado) => FONTE_SEM_CAMPO[fonte].filter((c) => filtros[c] != null);
  const contem = (termo: string) => ({ contains: termo, mode: "insensitive" as const });
  // CNPJ casa por prefixo em qualquer das formas de gravação (com e sem
  // pontuação) — daí o OR sobre as variantes, montado por fonte porque o nome
  // da coluna muda (cnpjInstituicao no BPS, cnpjOrgao no PNCP).
  const cnpjVariantes = variantesCnpj(filtros.cnpjComprador);

  const whereBps: Prisma.PrecoBpsWhereInput | null =
    variantes && brutasBps.length && !semCampo("bps").length
      ? {
          codigoCatmat: { in: variantes.bps },
          unidade: { in: brutasBps },
          ...(uf ? { uf } : {}),
          ...(filtros.fornecedor ? { fornecedor: contem(filtros.fornecedor) } : {}),
          ...(filtros.fabricante ? { fabricante: contem(filtros.fabricante) } : {}),
          ...(cnpjVariantes
            ? { OR: cnpjVariantes.map((v) => ({ cnpjInstituicao: { startsWith: v } })) }
            : {}),
        }
      : null;
  const whereSiasg: Prisma.PrecoSiasgWhereInput | null =
    variantes && brutasSiasg.length && !semCampo("siasg").length
      ? {
          codigoCatmat: { in: variantes.siasg },
          unidade: { in: brutasSiasg },
          acaoJudicial: true,
          ...(uf ? { uf } : {}),
          ...(filtros.fornecedor ? { fornecedor: contem(filtros.fornecedor) } : {}),
          ...(filtros.fabricante ? { fabricante: contem(filtros.fabricante) } : {}),
        }
      : null;
  const wherePncp: Prisma.PrecoPncpWhereInput | null =
    variantes && brutasPncp.length && !semCampo("pncp").length
      ? {
          codItemCatalogo: { in: variantes.pncp },
          unidade: { in: brutasPncp },
          ...(uf ? { uf } : {}),
          ...(filtros.fornecedor ? { fornecedor: contem(filtros.fornecedor) } : {}),
          ...(cnpjVariantes
            ? { OR: cnpjVariantes.map((v) => ({ cnpjOrgao: { startsWith: v } })) }
            : {}),
        }
      : null;

  // Registros ANVISA da unidade escolhida (a CMED é filtrada pela unidade do registro).
  const porRegistro = new Map(item.registros.map((r) => [r.registro, r]));
  const registrosDaUnidade = item.registros
    .filter((r) => r.unidadeNorm === unidade)
    .map((r) => r.registro);

  const buscarBps = async (): Promise<LinhaBps[]> => {
    if (!whereBps) return [];
    const rows = await db.precoBps.findMany({
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
        cnpjFornecedor: true,
        fabricante: true,
      },
    });
    return rows;
  };
  const buscarSiasg = async (): Promise<LinhaSiasg[]> => {
    if (!whereSiasg) return [];
    const rows = await db.precoSiasg.findMany({
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
        cnpjFornecedor: true,
        fabricante: true,
        marca: true,
        esfera: true,
      },
    });
    return rows;
  };
  const buscarPncp = async (): Promise<LinhaPncp[]> => {
    if (!wherePncp) return [];
    const rows = await db.precoPncp.findMany({
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
        cnpjFornecedor: true,
      },
    });
    return rows;
  };
  const buscarCmed = async (): Promise<PrecoCmed[]> => {
    if (!registrosDaUnidade.length) return [];
    const rows = await db.precoCmed.findMany({
      where: { registro: { in: registrosDaUnidade } },
      orderBy: [{ substancia: "asc" }, { produto: "asc" }, { apresentacao: "asc" }],
    });
    return rows;
  };
  const contarBps = async (): Promise<number> => {
    if (!whereBps) return 0;
    const n = await db.precoBps.count({ where: whereBps });
    return n;
  };
  const contarSiasg = async (): Promise<number> => {
    if (!whereSiasg) return 0;
    const n = await db.precoSiasg.count({ where: whereSiasg });
    return n;
  };
  const contarPncp = async (): Promise<number> => {
    if (!wherePncp) return 0;
    const n = await db.precoPncp.count({ where: wherePncp });
    return n;
  };

  const [bpsRows, siasgRows, pncpRows, cmedRows, totalBps, totalSiasg, totalPncp] =
    await Promise.all([
      buscarBps(),
      buscarSiasg(),
      buscarPncp(),
      buscarCmed(),
      contarBps(),
      contarSiasg(),
      contarPncp(),
    ]);

  const analiseBps = consolidar(
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
      cnpjFornecedor: r.cnpjFornecedor,
      marca: null,
      fabricante: r.fabricante,
    })),
    bpsRows.length,
    { fonte: "bps", filtrosNaoSuportados: semCampo("bps"), excluidos: excluidosPorFonte.get("bps") }
  );
  const analiseSiasg = consolidar(
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
      cnpjFornecedor: r.cnpjFornecedor,
      marca: r.marca,
      fabricante: r.fabricante,
      esfera: r.esfera,
    })),
    siasgRows.length,
    {
      fonte: "siasg",
      filtrosNaoSuportados: semCampo("siasg"),
      excluidos: excluidosPorFonte.get("siasg"),
    }
  );
  const analisePncp = consolidar(
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
      cnpjFornecedor: r.cnpjFornecedor,
      marca: null,
      fabricante: null,
    })),
    pncpRows.length,
    {
      fonte: "pncp",
      filtrosNaoSuportados: semCampo("pncp"),
      excluidos: excluidosPorFonte.get("pncp"),
    }
  );

  // Orçamentos diretos de fornecedor (art. 5º, IV) — informados pelo usuário,
  // não consultados em base. Entram como uma fonte a mais, sem IQR.
  // "Somente registro" é tratado como exclusão com motivo declarado: o
  // orçamento aparece no relatório, fora do cálculo, como o usuário pediu.
  const foraDoCalculo = new Map<string, string>(excluidosPorFonte.get("orcamentos"));
  for (const o of orcamentos) {
    if (!o.considerarNoCalculo && !foraDoCalculo.has(o.id)) {
      foraDoCalculo.set(o.id, "Marcado como somente registro pelo responsável pela pesquisa");
    }
  }
  const analiseOrcamentos = orcamentos.length
    ? consolidar(
        orcamentos.length,
        orcamentos.map((o) => ({
          id: o.id,
          descricao: [o.marca, o.fabricante].filter(Boolean).join(" — ") || o.fornecedor,
          unidade,
          preco: o.valorUnitario,
          qtd: null,
          data: o.dataOrcamento,
          uf: null,
          modalidade: "Orçamento direto",
          orgao: null,
          fornecedor: o.fornecedor,
          cnpjFornecedor: o.cnpj,
          marca: o.marca,
          fabricante: o.fabricante,
        })),
        orcamentos.length,
        { fonte: "orcamentos", semIqr: true, excluidos: foraDoCalculo }
      )
    : null;

  const bps = analiseBps.resultado;
  const siasg = analiseSiasg.resultado;
  const pncp = analisePncp.resultado;

  // CMED: preço por embalagem → por unidade de fornecimento (÷ Qt_Embal).
  const cmedTodos: RegistroCmedPreco[] = cmedRows.map((r) => {
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
      excluidoPor: excluidosPorFonte.get("cmed")?.get(r.id) ?? null,
    };
  });
  // Fabricante recorta também o teto: o PMVG passa a ser o do laboratório
  // escolhido. Casa tanto pelo laboratório da tabela de preços quanto pelo
  // fabricante do registro ANVISA — nem toda linha traz os dois preenchidos.
  const cmedRegistros = filtros.fabricante
    ? cmedTodos.filter(
        (r) =>
          contemTexto(r.laboratorio, filtros.fabricante as string) ||
          contemTexto(porRegistro.get(r.registro)?.fabricante, filtros.fabricante as string)
      )
    : cmedTodos;

  // Registro CMED desconsiderado não forma teto — mas continua listado, com o
  // motivo ao lado, para que a leitura do relatório reconstitua a decisão.
  const cmedConsiderados = cmedRegistros.filter((r) => r.excluidoPor === null);
  const pmvgUnitarios = cmedConsiderados
    .map((r) => r.pmvgUnitario)
    .filter((v): v is number => v != null && v > 0);
  const cmed: CmedResultado = {
    total: cmedRegistros.length,
    registros: cmedRegistros,
    pmvgUnitMin: pmvgUnitarios.length ? Math.min(...pmvgUnitarios) : null,
    pmvgUnitMax: pmvgUnitarios.length ? Math.max(...pmvgUnitarios) : null,
    semQtEmbalagem: cmedConsiderados.filter((r) => r.pmvgUnitario == null).length,
    excluidosManualmente: cmedRegistros.length - cmedConsiderados.length,
  };

  // ── Consolidação (art. 6º — média, mediana e menor valor) ──
  //
  // Duas leituras, ambas no relatório (ver o cabeçalho do arquivo):
  //   porFonte    — cada base pesa igual; é dela que sai o preço adotado.
  //   porRegistro — cada compra pesa igual; contraprova da anterior.
  const analises: Array<{ fonte: FonteCurada; analise: AnaliseFonte }> = [
    { fonte: "bps", analise: analiseBps },
    { fonte: "siasg", analise: analiseSiasg },
    { fonte: "pncp", analise: analisePncp },
  ];
  if (analiseOrcamentos) analises.push({ fonte: "orcamentos", analise: analiseOrcamentos });

  const comMediana = analises.filter((a) => a.analise.resultado.estatisticas.mediana !== null);
  const fontes = comMediana.map((a) => NOME_FONTE_CURADA[a.fonte]);
  const medianas = comMediana.map((a) => a.analise.resultado.estatisticas.mediana as number);

  const consolidado: Consolidado = {
    fontes: comMediana.map((a) => ({
      fonte: a.fonte,
      nome: NOME_FONTE_CURADA[a.fonte],
      estatisticas: a.analise.resultado.estatisticas,
    })),
    medianasPorFonte: medianas,
    porFonte: medianas.length ? calcularEstatisticas(medianas) : { ...ESTATISTICAS_VAZIAS },
    porRegistro: calcularEstatisticas(analises.flatMap((a) => a.analise.precos)),
  };
  const descartes = analises.flatMap((a) => a.analise.descartes);
  for (const r of cmedRegistros) {
    if (r.excluidoPor === null) continue;
    descartes.push({
      fonte: "cmed",
      id: r.id,
      descricao: `${r.produto || r.substancia || "Registro CMED"} — ${r.apresentacao || "—"} (reg. ${r.registro})`,
      preco: r.pmvgUnitario ?? r.pmvgEmbalagem,
      data: null,
      uf: null,
      fornecedor: r.laboratorio,
      motivo: r.excluidoPor,
    });
  }

  // ── Recomendação (IN 65/2021) ──
  const precoReferencia = consolidado.porFonte.mediana;
  const limitePmvg = cmed.pmvgUnitMin;
  const pmvgAplicado =
    limitePmvg !== null && precoReferencia !== null && precoReferencia > limitePmvg;
  const precoFinal = pmvgAplicado ? limitePmvg : (precoReferencia ?? limitePmvg);
  const capAplica = cmedRegistros.some((r) => r.cap);

  const observacoes: string[] = [];
  if (ativos.length) {
    observacoes.push(
      `Filtros adicionais aplicados: ${ativos
        .map((c) => `${ROTULO_FILTRO[c]} "${filtros[c]}"`)
        .join("; ")}. Os preços apurados consideram somente os registros que atendem a esses critérios.`
    );
    for (const fonte of ["bps", "siasg", "pncp"] as FonteMercado[]) {
      const faltando = semCampo(fonte);
      if (!faltando.length) continue;
      observacoes.push(
        `${NOME_FONTE[fonte]} não registra ${faltando
          .map((c) => ROTULO_FILTRO[c].toLowerCase())
          .join(" nem ")}; a fonte foi excluída da apuração enquanto esse filtro estiver ativo.`
      );
    }
    if (filtros.fabricante && cmedTodos.length > cmedRegistros.length) {
      observacoes.push(
        `CMED: ${cmedTodos.length - cmedRegistros.length} de ${cmedTodos.length} registro(s) ANVISA descartado(s) por não corresponderem ao fabricante informado.`
      );
    }
  }
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
      `Apenas ${fontes.length} fonte(s) com dados para este item e unidade. Recomenda-se busca adicional ou orçamento direto de fornecedor (art. 5º, IV).`
    );
  }
  if (bps.total === 0 && siasg.total === 0 && pncp.total === 0) {
    observacoes.push(
      "Nenhum registro encontrado nas bases de mercado para este código e unidade de fornecimento."
    );
  }
  if (analiseOrcamentos) {
    const noCalculo = analiseOrcamentos.resultado.estatisticas.n;
    observacoes.push(
      `${orcamentos.length} orçamento(s) direto(s) de fornecedor juntado(s) ao processo (art. 5º, IV da IN 65/2021); ${noCalculo} considerado(s) no cálculo do preço de referência.`
    );
  }
  if (descartes.length) {
    observacoes.push(
      `${descartes.length} registro(s) desconsiderado(s) por decisão fundamentada do responsável (art. 6º, §§ 1º e 2º). Cada descarte está relacionado no relatório com a respectiva justificativa.`
    );
  }

  return {
    item,
    unidade,
    uf,
    filtros,
    resultados: {
      cmed,
      bps,
      siasg,
      pncp,
      orcamentos: analiseOrcamentos?.resultado ?? null,
    },
    consolidado,
    orcamentos,
    descartes,
    recomendacao: {
      precoReferencia,
      mediaConsolidada: consolidado.porFonte.media,
      menorConsolidado: consolidado.porFonte.menor,
      limitePmvg,
      precoFinal,
      metodologia: METODO_ADOTADO,
      fontes,
      observacoes,
    },
  };
}
