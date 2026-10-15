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
  NOME_FONTE_CURADA,
  ORDEM_TIPOS_INFORMADOS,
  TIPOS_PRECO_INFORMADO,
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

import {
  INFO_FONTE,
  corrigidoPeloIpca,
  type ContratacaoRef,
  type DuplicidadeRef,
  type FonteMercadoChave,
  type Inciso,
} from "@/lib/pesquisa-preco-fontes";
import {
  descricaoPeriodo,
  janelaDaFonte,
  normalizarPeriodo,
  validarPeriodo,
  type JanelaFonte,
  type PeriodoPesquisa,
} from "@/lib/pesquisa-preco-periodo";
import { CONVENCAO_IPCA, fatorIpca, mesBaseIpca } from "@/lib/ipca";
import { carregarIpca } from "@/lib/ipca-indices";
import { marcarDuplicidades } from "@/lib/pesquisa-preco-duplicidade";
import { consultarDadosAbertos, type ResultadoDadosAbertos } from "@/lib/dados-abertos/pesquisa";
import { situacaoColetas, type OrigemColeta, type SituacaoColeta } from "@/lib/dados-abertos/situacao";
import { urlPncp } from "@/lib/pncp";
import {
  ESCOLHA_PADRAO,
  ROTULO_METODO,
  camposDoPreco,
  normalizarEscolha,
  rotuloRegraTeto,
  rotuloRegraTetoCurto,
  type EscolhaPreco,
  type TetoCmed,
  type TetosCmed,
} from "@/lib/pesquisa-preco-metodo";

export * from "@/lib/pesquisa-preco-filtros";
export * from "@/lib/pesquisa-preco-curadoria";
export * from "@/lib/pesquisa-preco-metodo";
export * from "@/lib/pesquisa-preco-fontes";
export * from "@/lib/pesquisa-preco-periodo";

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
// adotado e a regra do teto saem de lib/pesquisa-preco-metodo.ts (P11/P12):
// no padrão do painel, a mediana das medianas por fonte limitada ao menor PMVG
// unitário sem impostos (CMED); no mapa da DLOG, o teto padrão é o PMVG 17% do
// medicamento de referência.
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
  /** Contratação de origem (nº da compra, UASG, item, link PNCP); D3. */
  contratacao?: ContratacaoRef | null;
  /** Data/hora da coleta na API ou do acesso à fonte (ISO). */
  coletadoEm?: string | null;
  /** Preço como publicado; `preco` é o corrigido quando o IPCA está ligado (D2). */
  precoNominal?: number;
  /** Fator do IPCA aplicado (1 = sem correção); null/ausente = IPCA desligado. */
  fatorIpca?: number | null;
  /** Mês do preço na tabela de índices ("2026-03"). */
  mesIndice?: string | null;
  /** Registro ANVISA do produto comprado (BPS pela API). */
  registroAnvisa?: string | null;
  /** Cópia do mesmo registro numa fonte que prevalece (P18). */
  duplicadoDe?: DuplicidadeRef | null;
  /** idCompra (17) + nº do item (5): identifica a mesma compra em bases diferentes. */
  chaveItemCompra22?: string | null;
}

export interface FonteMercadoResultado {
  /** Filtros opcionais que esta base não possui como campo — ver FONTE_SEM_CAMPO. */
  filtrosNaoSuportados: CampoFiltro[];
  /** Base carregada no painel, coleta das APIs de dados abertos ou preço informado. */
  origemDados?: "BASE_PAINEL" | "API" | "INFORMADO";
  /** Situação da coleta (fontes de dados abertos): quando e se ainda vale (P19). */
  coleta?: { coletadoEm: string | null; valida: boolean; origemCarga: string | null } | null;
  /**
   * Janela do art. 5º aplicada à fonte (D1) e o que ficou de fora — para o
   * aviso "fora do período: m (mais recente em …)".
   */
  periodo?: {
    inicio: string | null;
    fim: string;
    meses: number | null;
    inciso: Inciso;
    foraDoPeriodo: number;
    maisRecenteFora: string | null;
  } | null;
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
  cnpj: string | null;
  /** EAN 1 da lista mensal (CmedPrecoVersao); só no modo `registrosCompletos`. */
  ean: string | null;
  classeTerapeutica: string | null;
  /** "Novo", "Genérico", "Similar", "Biológico"… — define o medicamento de referência. */
  tipoProduto: string | null;
  regimePreco: string | null;
  unidadeFornecimento: string | null;
  qtEmbalagem: number | null;
  /** PMVG sem impostos por EMBALAGEM (como consta na tabela CMED). */
  pmvgEmbalagem: number;
  /** PMVG da embalagem por alíquota de ICMS (teto pela regra do medicamento de referência). */
  pmvg0: number | null;
  pmvg12: number | null;
  pmvg17: number | null;
  pmvg18: number | null;
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
  /** Método e regra do teto que formaram o preço (P11/P12). */
  escolha: EscolhaPreco;
  /**
   * Preço pelo método escolhido, antes do teto. No padrão do painel é a
   * mediana das medianas por fonte (art. 6º, caput).
   */
  precoReferencia: number | null;
  /** Os outros dois métodos do art. 6º sobre as medianas, para conferência no relatório. */
  mediaConsolidada: number | null;
  menorConsolidado: number | null;
  /** Teto pela regra escolhida (PMVG por unidade). */
  limitePmvg: number | null;
  /** Registro CMED que forma o teto escolhido. */
  teto: TetoCmed | null;
  /** Os dois tetos (menor PMVG sem impostos e PMVG do medicamento de referência). */
  tetos: TetosCmed;
  /** O preço do método superou o teto e o teto prevaleceu. */
  tetoAplicado: boolean;
  precoFinal: number | null;
  /** "Mediana das medianas", "Teto CMED — … acima do teto" — coluna Método do mapa. */
  descricaoMetodo: string;
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
    /** Compras.gov.br (Painel de Preços) — preenchida quando há coleta da API. */
    comprasgov?: FonteMercadoResultado | null;
    bps: FonteMercadoResultado;
    siasg: FonteMercadoResultado;
    pncp: FonteMercadoResultado;
    /** Itens de atas de registro de preços — preenchida quando há coleta da API. */
    arp?: FonteMercadoResultado | null;
    /** Preços informados pelo responsável (P13), um tipo por fonte; null quando não há. */
    similar?: FonteMercadoResultado | null;
    midia?: FonteMercadoResultado | null;
    /** Cotações diretas informadas pelo usuário; null quando não há nenhuma. */
    orcamentos: FonteMercadoResultado | null;
    notaFiscal?: FonteMercadoResultado | null;
  };
  consolidado: Consolidado;
  /** Orçamentos diretos como foram informados (inclusive os fora do cálculo). */
  orcamentos: OrcamentoFornecedor[];
  /** Registros desconsiderados e o motivo — rastreabilidade do descarte. */
  descartes: RegistroDescartado[];
  recomendacao: Recomendacao;
  /** Data de referência e período aplicados (D1). */
  periodo: PeriodoPesquisa;
  /** Atualização monetária (D2): ligada, disponível, mês-base e convenção. */
  ipca: {
    /** O responsável pediu a atualização (padrão: sim, P10). */
    pedido: boolean;
    /** Pedida E aplicada (havia índice para o mês-base). */
    ligado: boolean;
    /** A tabela IndiceIpca existe e tem índices. */
    disponivel: boolean;
    /** "AAAA-MM"; null quando a correção não foi aplicada. */
    mesBase: string | null;
    convencao: string;
    /** Registros sem número-índice para o mês do preço (fator 1). */
    semIndice: number;
  };
  /** Registros que saíram do conjunto único por serem a mesma compra de outra base (P18). */
  duplicidades: number;
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
  /** Método do preço e regra do teto (P11/P12); o que faltar segue ESCOLHA_PADRAO. */
  escolha?: Partial<EscolhaPreco> | null;
  /** Data de referência e período do art. 5º (D1); ausente = hoje, 12 meses. */
  periodo?: Partial<PeriodoPesquisa> | null;
  /** Atualização pelo IPCA dos incisos I e II (D2); ausente = ligada (P10). */
  corrigirIpca?: boolean;
  /** ids de prováveis duplicatas que o responsável manteve no conjunto único (P18). */
  duplicidadesRevertidas?: string[] | unknown;
  /**
   * Devolve TODOS os registros da amostra de cada fonte, e não só os
   * REGISTROS_ANALISE mais recentes, além do EAN da CMED. É o modo do mapa
   * XLSX: a planilha lista a amostra inteira que entrou no cálculo.
   */
  registrosCompletos?: boolean;
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
  origemDados?: FonteMercadoResultado["origemDados"];
  coleta?: FonteMercadoResultado["coleta"];
  periodo?: FonteMercadoResultado["periodo"];
  /** Lista a amostra inteira (mapa XLSX), sem o recorte de REGISTROS_ANALISE. */
  completos?: boolean;
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
  /** Preços que compõem a estatística da fonte. */
  precos: number[];
  /**
   * Os mesmos, menos as cópias de compras de outra base (P18): alimentam o
   * consolidado por registro, em que cada compra conta uma vez.
   */
  precosConjunto: number[];
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

  const precosConjunto = comOutlier
    .filter((r) => r.excluidoPor === null && r.preco > 0 && !r.outlierIqr && !r.duplicadoDe)
    .map((r) => r.preco);

  // A curadoria precisa ver todos os destoantes, mesmo os que caíram fora dos
  // REGISTROS_ANALISE mais recentes — são exatamente os candidatos a exclusão.
  const recentes = opcoes.completos ? comOutlier : comOutlier.slice(0, REGISTROS_ANALISE);
  const jaListados = new Set(recentes.map((r) => r.id));
  const destoantes = comOutlier.filter((r) => r.outlierIqr && !jaListados.has(r.id));

  return {
    resultado: {
      filtrosNaoSuportados: opcoes.filtrosNaoSuportados ?? [],
      ...(opcoes.origemDados ? { origemDados: opcoes.origemDados } : {}),
      ...(opcoes.coleta !== undefined ? { coleta: opcoes.coleta } : {}),
      ...(opcoes.periodo !== undefined ? { periodo: opcoes.periodo } : {}),
      total,
      amostra,
      estatisticas: calcularEstatisticas(dentro),
      outliersRemovidos: precos.length - dentro.length,
      excluidosManualmente: descartes.length,
      registros: [...recentes, ...destoantes],
    },
    precos: dentro,
    precosConjunto,
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

/** Fontes cujas unidades vêm brutas da base (as de dados abertos já gravam a normalizada). */
type FonteComUnidadeBruta = "bps" | "siasg" | "pncp";

interface MapaUnidades {
  opcoes: UnidadeOpcao[];
  /** unidade normalizada → valores brutos por fonte (filtro por igualdade no banco). */
  brutas: Record<FonteComUnidadeBruta, Map<string, string[]>>;
  /** O BPS desta pesquisa vem da coleta da API (P21), e não de PrecoBps. */
  bpsDaApi: boolean;
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
  // Dados abertos (Compras.gov.br, BPS pela API, atas): unidade já normalizada.
  const gruposDadosAbertos = async (): Promise<Array<{ origem: string; unidadeNorm: string | null; n: number }>> => {
    if (!item.catmat) return [];
    try {
      const grupos = await db.dadosAbertosPreco.groupBy({
        by: ["origem", "unidadeNorm"],
        where: { codigoCatmat: item.catmat },
        _count: { _all: true },
      });
      return grupos.map((g) => ({ origem: g.origem, unidadeNorm: g.unidadeNorm, n: g._count._all }));
    } catch {
      // Tabela ainda não criada (scripts/create_dadosabertos_tables.py).
      return [];
    }
  };

  const [bps, siasg, pncp, cmedComPreco, dadosAbertos] = await Promise.all([
    gruposBps(),
    gruposSiasg(),
    gruposPncp(),
    registrosComPreco(),
    gruposDadosAbertos(),
  ]);
  const bpsDaApi = dadosAbertos.some((g) => g.origem === "BPS");

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
      fontes: { cmed: 0, comprasgov: 0, bps: 0, siasg: 0, pncp: 0, arp: 0 },
    };
    atual.total += n;
    atual.fontes[fonte] += n;
    opcoes.set(unidadeNorm, atual);
  };

  const registrar = (fonte: FonteComUnidadeBruta, grupos: GrupoUnidade[]) => {
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

  // P21: com coleta do BPS pela API, as unidades do BPS saem dela.
  if (!bpsDaApi) registrar("bps", bps);
  registrar("siasg", siasg);
  registrar("pncp", pncp);
  const fonteDaOrigem: Record<string, FonteMercado> = { COMPRASGOV: "comprasgov", BPS: "bps", ARP_ITEM: "arp" };
  for (const g of dadosAbertos) {
    const fonte = fonteDaOrigem[g.origem];
    if (fonte && g.unidadeNorm) somar(fonte, g.unidadeNorm, g.n);
  }

  const comPreco = new Set(cmedComPreco);
  for (const r of item.registros) {
    if (comPreco.has(r.registro)) somar("cmed", r.unidadeNorm, 1);
  }

  return {
    opcoes: Array.from(opcoes.values()).sort(
      (a, b) => b.total - a.total || a.unidade.localeCompare(b.unidade, "pt-BR")
    ),
    brutas,
    bpsDaApi,
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
  numeroControlePncp: string | null;
}

const toISO = (d: Date) => d.toISOString();

/**
 * EAN 1 de cada apresentação (código GGREM), da versão mais recente na lista
 * mensal da CMED. A busca vai pelo registro (indexado) e o GGREM separa as
 * apresentações. Sem a tabela (ambiente sem a carga mensal), segue sem EAN.
 */
async function eansPorApresentacao(
  linhas: Array<{ registro: string | null; codigoGgrem: string | null }>
): Promise<Map<string, string>> {
  const registros = Array.from(new Set(linhas.map((l) => l.registro).filter((r): r is string => !!r)));
  const ggrems = new Set(linhas.map((l) => l.codigoGgrem).filter((g): g is string => !!g));
  const mapa = new Map<string, string>();
  if (!registros.length || !ggrems.size) return mapa;
  try {
    const versoes = await db.cmedPrecoVersao.findMany({
      where: { registro: { in: registros } },
      orderBy: { id: "desc" },
      select: { codigoGgrem: true, ean: true },
    });
    for (const v of versoes) {
      if (!v.codigoGgrem || !ggrems.has(v.codigoGgrem) || mapa.has(v.codigoGgrem)) continue;
      if (v.ean.length) mapa.set(v.codigoGgrem, v.ean[0]);
    }
  } catch (error) {
    console.warn("[pesquisa-preco] EAN indisponível:", (error as Error).message);
  }
  return mapa;
}

export async function pesquisarPrecos(p: ParametrosPesquisa): Promise<ResultadoPesquisa | null> {
  const item = await resolverItem(p.codigo);
  if (!item) return null;

  const unidade = normalizarUnidade(p.unidade) || UNIDADE_EMBALAGEM;
  const uf = p.uf ? p.uf.toUpperCase() : null;
  const escolha = normalizarEscolha(p.escolha, ESCOLHA_PADRAO);
  const completos = p.registrosCompletos === true;
  // Período do art. 5º (D1). As rotas recusam ampliação sem justificativa; se
  // ainda assim chegar aqui, vale o padrão de 12 meses — nunca ampliar calado.
  let periodo = normalizarPeriodo(p.periodo);
  const periodoInvalido = validarPeriodo(periodo);
  if (periodoInvalido) periodo = { ...periodo, mesesMercado: 12, justificativaAmpliacao: null };
  const janela = (fonte: FonteMercadoChave): JanelaFonte => janelaDaFonte(fonte, periodo);
  const corrigirIpca = p.corrigirIpca !== false;
  const [{ brutas, bpsDaApi }, coletas] = await Promise.all([
    mapearUnidades(item),
    item.catmat ? situacaoColetas(item.catmat) : Promise.resolve(null),
  ]);
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

  // P21: com coleta do BPS pela API, a fonte BPS lê DadosAbertosPreco; sem
  // coleta, a base carregada no painel (PrecoBps), com aviso.
  const whereBps: Prisma.PrecoBpsWhereInput | null =
    !bpsDaApi && variantes && brutasBps.length && !semCampo("bps").length
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

  // Janela do art. 5º sobre a data de cada base (D1): o que fica de fora é
  // contado, para o aviso "fora do período: m (mais recente em …)".
  const dataInicio = (j: JanelaFonte) => (j.inicio ? new Date(`${j.inicio}T00:00:00Z`) : null);
  const dataFim = (j: JanelaFonte) => new Date(`${j.fim}T23:59:59.999Z`);
  const naJanela = (j: JanelaFonte) => ({ ...(dataInicio(j) ? { gte: dataInicio(j) as Date } : {}), lte: dataFim(j) });
  const foraJanela = (j: JanelaFonte) => (dataInicio(j) ? { lt: dataInicio(j) as Date } : null);
  const jBps = janela("bps");
  const jSiasg = janela("siasg");
  const jPncp = janela("pncp");

  const buscarBps = async (): Promise<LinhaBps[]> => {
    if (!whereBps) return [];
    const rows = await db.precoBps.findMany({
      where: { AND: [whereBps, { data: naJanela(jBps) }] },
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
      where: { AND: [whereSiasg, { data: naJanela(jSiasg) }] },
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
      where: { AND: [wherePncp, { data: naJanela(jPncp) }] },
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
        numeroControlePncp: true,
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
  type Contagem = { total: number; fora: number; maisRecenteFora: string | null };
  const SEM_CONTAGEM: Contagem = { total: 0, fora: 0, maisRecenteFora: null };
  const contarBps = async (): Promise<Contagem> => {
    if (!whereBps) return SEM_CONTAGEM;
    const fora = foraJanela(jBps);
    const [total, nFora, ultima] = await Promise.all([
      db.precoBps.count({ where: { AND: [whereBps, { data: naJanela(jBps) }] } }),
      fora ? db.precoBps.count({ where: { AND: [whereBps, { data: fora }] } }) : Promise.resolve(0),
      fora ? db.precoBps.findFirst({ where: { AND: [whereBps, { data: fora }] }, orderBy: { data: "desc" }, select: { data: true } }) : Promise.resolve(null),
    ]);
    return { total, fora: nFora, maisRecenteFora: ultima ? toISO(ultima.data) : null };
  };
  const contarSiasg = async (): Promise<Contagem> => {
    if (!whereSiasg) return SEM_CONTAGEM;
    const fora = foraJanela(jSiasg);
    const [total, nFora, ultima] = await Promise.all([
      db.precoSiasg.count({ where: { AND: [whereSiasg, { data: naJanela(jSiasg) }] } }),
      fora ? db.precoSiasg.count({ where: { AND: [whereSiasg, { data: fora }] } }) : Promise.resolve(0),
      fora ? db.precoSiasg.findFirst({ where: { AND: [whereSiasg, { data: fora }] }, orderBy: { data: "desc" }, select: { data: true } }) : Promise.resolve(null),
    ]);
    return { total, fora: nFora, maisRecenteFora: ultima ? toISO(ultima.data) : null };
  };
  const contarPncp = async (): Promise<Contagem> => {
    if (!wherePncp) return SEM_CONTAGEM;
    const fora = foraJanela(jPncp);
    const [total, nFora, ultima] = await Promise.all([
      db.precoPncp.count({ where: { AND: [wherePncp, { data: naJanela(jPncp) }] } }),
      fora ? db.precoPncp.count({ where: { AND: [wherePncp, { data: fora }] } }) : Promise.resolve(0),
      fora ? db.precoPncp.findFirst({ where: { AND: [wherePncp, { data: fora }] }, orderBy: { data: "desc" }, select: { data: true } }) : Promise.resolve(null),
    ]);
    return { total, fora: nFora, maisRecenteFora: ultima ? toISO(ultima.data) : null };
  };

  // Fontes de dados abertos (Compras.gov.br, BPS pela API, atas), na janela da fonte.
  const consultaDA = (origem: OrigemColeta, fonte: FonteMercadoChave & FonteMercado): Promise<ResultadoDadosAbertos | null> => {
    if (!item.catmat || semCampo(fonte).length) return Promise.resolve(null);
    const j = janela(fonte);
    return consultarDadosAbertos({
      origem,
      catmat: item.catmat,
      unidade,
      uf,
      filtros,
      amostra: AMOSTRA,
      inicio: dataInicio(j),
      fim: dataFim(j),
    });
  };

  const [bpsRows, siasgRows, pncpRows, cmedRows, contBps, contSiasg, contPncp, daComprasGov, daBps, daArp, tabelaIpca] =
    await Promise.all([
      buscarBps(),
      buscarSiasg(),
      buscarPncp(),
      buscarCmed(),
      contarBps(),
      contarSiasg(),
      contarPncp(),
      consultaDA("COMPRASGOV", "comprasgov"),
      bpsDaApi ? consultaDA("BPS", "bps") : Promise.resolve(null),
      consultaDA("ARP_ITEM", "arp"),
      corrigirIpca ? carregarIpca() : Promise.resolve(null),
    ]);
  const coletaDe = (origem: OrigemColeta): FonteMercadoResultado["coleta"] => {
    const s: SituacaoColeta | undefined = coletas?.porOrigem[origem];
    return s ? { coletadoEm: s.coletadoEm, valida: s.valida, origemCarga: s.origemCarga } : null;
  };

  // ── 1. Registros de cada fonte, já na janela do art. 5º ──
  interface FonteBruta {
    fonte: FonteMercadoChave;
    total: number;
    registros: RegistroBruto[];
    opcoes: OpcoesConsolidacao;
  }
  const periodoDe = (fonte: FonteMercadoChave, fora: number, maisRecenteFora: string | null): FonteMercadoResultado["periodo"] => {
    const j = janela(fonte);
    return { inicio: j.inicio, fim: j.fim, meses: j.meses, inciso: j.inciso, foraDoPeriodo: fora, maisRecenteFora };
  };
  const daFonte = (
    fonte: FonteMercadoChave & FonteMercado,
    origem: OrigemColeta,
    r: ResultadoDadosAbertos | null
  ): FonteBruta => ({
    fonte,
    total: r?.total ?? 0,
    registros: r?.registros ?? [],
    opcoes: {
      fonte,
      completos,
      origemDados: "API",
      coleta: coletaDe(origem),
      periodo: periodoDe(fonte, r?.foraDoPeriodo ?? 0, r?.maisRecenteFora ?? null),
      filtrosNaoSuportados: semCampo(fonte),
      excluidos: excluidosPorFonte.get(fonte),
    },
  });
  const local = (fonte: "bps" | "siasg" | "pncp", c: Contagem, registros: RegistroBruto[]): FonteBruta => ({
    fonte,
    total: c.total,
    registros,
    opcoes: {
      fonte,
      completos,
      origemDados: "BASE_PAINEL",
      periodo: periodoDe(fonte, c.fora, c.maisRecenteFora),
      filtrosNaoSuportados: semCampo(fonte),
      excluidos: excluidosPorFonte.get(fonte),
    },
  });

  const fontesBrutas: FonteBruta[] = [
    daFonte("comprasgov", "COMPRASGOV", daComprasGov),
    bpsDaApi
      ? daFonte("bps", "BPS", daBps)
      : local(
          "bps",
          contBps,
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
          }))
        ),
    local(
      "siasg",
      contSiasg,
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
      }))
    ),
    local(
      "pncp",
      contPncp,
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
        // A base carregada tem a coluna, mas hoje vazia (diagnóstico de out/2026).
        contratacao: r.numeroControlePncp
          ? {
              tipo: r.modalidade,
              numero: null,
              uasg: null,
              nomeUasg: null,
              numeroItem: null,
              processo: null,
              criterioJulgamento: null,
              situacao: null,
              numeroControlePncp: r.numeroControlePncp,
              numeroControlePncpAta: null,
              url: urlPncp(r.numeroControlePncp),
              referencia: null,
              indisponivel: "não disponível na base PNCP do painel",
            }
          : null,
      }))
    ),
    daFonte("arp", "ARP_ITEM", daArp),
  ];

  // Preços informados pelo responsável (P13): um tipo por fonte, com a janela
  // do seu inciso. "Somente registro" e fora do período viram exclusão com
  // motivo declarado: o preço continua no relatório, fora do cálculo.
  for (const tipo of ORDEM_TIPOS_INFORMADOS) {
    const doTipo = orcamentos.filter((o) => (o.tipo ?? "IV") === tipo);
    if (!doTipo.length) continue;
    const { fonte, rotulo } = TIPOS_PRECO_INFORMADO[tipo];
    const fonteM = fonte as FonteMercadoChave;
    const j = janela(fonteM);
    const motivos = new Map<string, string>(excluidosPorFonte.get(fonte));
    let fora = 0;
    let maisRecenteFora: string | null = null;
    for (const o of doTipo) {
      const dia = o.dataOrcamento.slice(0, 10);
      const foraDaJanela = (j.inicio !== null && dia < j.inicio) || dia > j.fim;
      if (foraDaJanela) {
        fora += 1;
        if (!maisRecenteFora || o.dataOrcamento > maisRecenteFora) maisRecenteFora = o.dataOrcamento;
      }
      if (motivos.has(o.id)) continue;
      if (!o.considerarNoCalculo) {
        motivos.set(o.id, "Marcado como somente registro pelo responsável pela pesquisa");
      } else if (foraDaJanela && !o.justificativaForaPeriodo) {
        motivos.set(o.id, `Fora do período do inciso ${j.inciso} do art. 5º (${j.meses} meses antes da data de referência)`);
      }
    }
    fontesBrutas.push({
      fonte: fonteM,
      total: doTipo.length,
      registros: doTipo.map((o) => ({
        id: o.id,
        descricao: [o.marca, o.fabricante].filter(Boolean).join(" — ") || o.fornecedor,
        unidade,
        preco: o.valorUnitario,
        qtd: null,
        data: o.dataOrcamento,
        uf: null,
        modalidade: rotulo,
        orgao: null,
        fornecedor: o.fornecedor,
        cnpjFornecedor: o.cnpj,
        marca: o.marca,
        fabricante: o.fabricante,
        coletadoEm: o.acessadoEm ?? o.dataOrcamento,
        contratacao: {
          tipo: rotulo,
          numero: o.documento,
          uasg: null,
          nomeUasg: null,
          numeroItem: null,
          processo: null,
          criterioJulgamento: null,
          situacao: null,
          numeroControlePncp: null,
          numeroControlePncpAta: null,
          url: o.url,
          referencia:
            [o.documento, o.chaveNfe ? `chave NF-e ${o.chaveNfe}` : null, o.observacao].filter(Boolean).join(" — ") ||
            "preço informado pelo responsável",
          indisponivel: null,
        },
      })),
      opcoes: {
        fonte,
        completos,
        origemDados: "INFORMADO",
        periodo: { inicio: j.inicio, fim: j.fim, meses: j.meses, inciso: j.inciso, foraDoPeriodo: fora, maisRecenteFora },
        semIqr: true,
        excluidos: motivos,
      },
    });
  }

  // ── 2. IPCA (D2): só os incisos I e II; o nominal fica guardado ao lado ──
  const indicesIpca = tabelaIpca?.disponivel ? tabelaIpca.indices : null;
  const mesBase = indicesIpca ? mesBaseIpca(periodo.dataReferencia, indicesIpca) : null;
  let semIndice = 0;
  for (const f of fontesBrutas) {
    const corrige = mesBase !== null && indicesIpca !== null && corrigidoPeloIpca(f.fonte);
    for (const r of f.registros) {
      r.precoNominal = r.preco;
      r.mesIndice = r.data.slice(0, 7);
      if (!corrige) {
        r.fatorIpca = null;
        continue;
      }
      const fator = fatorIpca(r.mesIndice, mesBase as string, indicesIpca as Map<string, number>);
      if (fator.semIndice) semIndice += 1;
      r.fatorIpca = fator.fator;
      r.preco = r.preco * fator.fator;
    }
  }

  // ── 3. A mesma compra em mais de uma base (P18) ──
  const revertidas = new Set(
    Array.isArray(p.duplicidadesRevertidas) ? p.duplicidadesRevertidas.map((x) => String(x)) : []
  );
  const marcasDuplicidade = marcarDuplicidades(
    fontesBrutas
      .filter((f) => !INFO_FONTE[f.fonte].informado)
      .flatMap((f) =>
        f.registros.map((r) => ({
          id: r.id,
          fonte: f.fonte,
          chaveItemCompra22: r.chaveItemCompra22 ?? null,
          cnpjFornecedor: r.cnpjFornecedor,
          preco: r.precoNominal ?? r.preco,
          uf: r.uf,
          data: r.data,
          qtd: r.qtd,
        }))
      ),
    revertidas
  );
  for (const f of fontesBrutas) {
    for (const r of f.registros) r.duplicadoDe = marcasDuplicidade.get(r.id) ?? null;
  }

  // ── 4. Estatística por fonte ──
  const analisePorFonte = new Map<FonteMercadoChave, AnaliseFonte>(
    fontesBrutas.map((f) => [f.fonte, consolidar(f.total, f.registros, f.registros.length, f.opcoes)])
  );
  const resultadoDe = (fonte: FonteMercadoChave) => analisePorFonte.get(fonte)?.resultado ?? null;
  const bps = resultadoDe("bps") as FonteMercadoResultado;
  const siasg = resultadoDe("siasg") as FonteMercadoResultado;
  const pncp = resultadoDe("pncp") as FonteMercadoResultado;
  const comprasgov = resultadoDe("comprasgov") as FonteMercadoResultado;
  const arp = resultadoDe("arp") as FonteMercadoResultado;

  // EAN só no modo do mapa: vem da lista mensal (CmedPrecoVersao), uma consulta
  // a mais que a tela não precisa.
  const eans = completos ? await eansPorApresentacao(cmedRows) : new Map<string, string>();

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
      cnpj: r.cnpj,
      ean: (r.codigoGgrem ? eans.get(r.codigoGgrem) : undefined) ?? null,
      classeTerapeutica: r.classeTerap,
      tipoProduto: r.tipoProduto,
      regimePreco: r.regimePreco,
      unidadeFornecimento: meta?.unidadeFornecimento ?? null,
      qtEmbalagem: qt,
      pmvgEmbalagem: r.pmvgSemImpostos,
      pmvg0: r.pmvg0,
      pmvg12: r.pmvg12,
      pmvg17: r.pmvg17,
      pmvg18: r.pmvg18,
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
  const analises: Array<{ fonte: FonteCurada; analise: AnaliseFonte }> = fontesBrutas.map((f) => ({
    fonte: f.fonte,
    analise: analisePorFonte.get(f.fonte) as AnaliseFonte,
  }));

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
    // Cada compra uma vez: as cópias entre bases (P18) ficam fora.
    porRegistro: calcularEstatisticas(analises.flatMap((a) => a.analise.precosConjunto)),
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
  // Método e teto saem de lib/pesquisa-preco-metodo.ts, o mesmo código que a
  // tela usa para mostrar o efeito de cada escolha antes da emissão.
  const preco = camposDoPreco(consolidado, cmed, escolha);
  const { precoReferencia, limitePmvg } = preco;
  const pmvgAplicado = preco.tetoAplicado;
  const capAplica = cmedRegistros.some((r) => r.cap);

  const observacoes: string[] = [];
  // Período do art. 5º (D1) e o que cada fonte deixou de fora.
  observacoes.push(`Período da pesquisa: ${descricaoPeriodo(periodo)}`);
  if (periodoInvalido) {
    observacoes.push(`Período ampliado sem justificativa suficiente: aplicado o padrão de 12 meses. ${periodoInvalido}`);
  }
  for (const f of fontesBrutas) {
    const per = analisePorFonte.get(f.fonte)?.resultado.periodo;
    if (!per || !per.foraDoPeriodo) continue;
    const vazia = f.total === 0;
    observacoes.push(
      `${NOME_FONTE_CURADA[f.fonte]}: ${per.foraDoPeriodo} registro(s) fora do período${
        per.maisRecenteFora ? ` (o mais recente em ${new Date(per.maisRecenteFora).toLocaleDateString("pt-BR", { timeZone: "UTC" })})` : ""
      }${vazia ? " — a fonte ficou sem preço no período (art. 5º, §1º: priorizar os incisos I e II e justificar)" : ""}.`
    );
  }
  // IPCA (D2).
  if (corrigirIpca && mesBase) {
    observacoes.push(
      `Preços dos incisos I e II atualizados pelo IPCA até ${mesBase.slice(5, 7)}/${mesBase.slice(0, 4)}. ${CONVENCAO_IPCA}${
        semIndice ? ` ${semIndice} registro(s) sem índice para o mês do preço ficaram sem correção.` : ""
      } O teto CMED não é corrigido.`
    );
  } else if (corrigirIpca) {
    observacoes.push("Atualização pelo IPCA pedida, mas a tabela de índices não está carregada (scripts/import_ipca.py): preços em valores nominais.");
  }
  // Duplicidade entre bases (P18).
  if (marcasDuplicidade.size) {
    const provaveis = Array.from(marcasDuplicidade.values()).filter((m) => m.provavel).length;
    observacoes.push(
      `${marcasDuplicidade.size} registro(s) são a mesma compra de outra base e ficaram fora do conjunto único${
        provaveis ? ` (${provaveis} por regra — prováveis duplicatas do BPS, reversíveis na curadoria)` : ""
      }; cada base continua com a sua estatística no consolidado por fonte.`
    );
  }
  if (ativos.length) {
    observacoes.push(
      `Filtros adicionais aplicados: ${ativos
        .map((c) => `${ROTULO_FILTRO[c]} "${filtros[c]}"`)
        .join("; ")}. Os preços apurados consideram somente os registros que atendem a esses critérios.`
    );
    for (const fonte of ["comprasgov", "bps", "siasg", "pncp", "arp"] as FonteMercado[]) {
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
      `Preço apurado pelo método (${ROTULO_METODO[escolha.metodo].curto.toLowerCase()}, R$ ${precoReferencia.toFixed(4)}) supera o teto CMED (${rotuloRegraTetoCurto(escolha.regraTeto, escolha.aliquota)}, R$ ${limitePmvg.toFixed(4)} por unidade). Teto aplicado.`
    );
  }
  if (escolha.regraTeto === "pmvg_referencia" && preco.teto) {
    observacoes.push(
      `Teto pela regra do medicamento de referência: ${preco.teto.produto} (reg. ${preco.teto.registro}) — ${preco.teto.criterio}.`
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
  if (item.catmat && !bpsDaApi && bps.total > 0) {
    observacoes.push(
      "BPS de base histórica (carga do painel, sem nº do processo nem da ata). Atualize pela API do BPS para trazer a identificação da compra."
    );
  }
  for (const [origem, nome] of [["COMPRASGOV", "Compras.gov.br"], ["BPS", "BPS"], ["ARP_ITEM", "Atas de registro de preços"]] as const) {
    const s = coletas?.porOrigem[origem];
    if (s?.coletadoEm && !s.valida) {
      observacoes.push(
        `${nome}: dados coletados em ${new Date(s.coletadoEm).toLocaleDateString("pt-BR")}, há mais de 7 dias — atualize a coleta antes de emitir o relatório.`
      );
    }
  }
  if (item.catmat && coletas && !coletas.indisponivel && !coletas.porOrigem.COMPRASGOV.registros) {
    observacoes.push(
      "Compras.gov.br (Painel de Preços) ainda não coletado para este CATMAT: use \"Coletar dados abertos\" para incluir as compras públicas dos últimos meses."
    );
  }
  if (bps.total === 0 && siasg.total === 0 && pncp.total === 0 && comprasgov.total === 0 && arp.total === 0) {
    observacoes.push(
      "Nenhum registro encontrado nas bases de mercado para este código e unidade de fornecimento."
    );
  }
  for (const tipo of ORDEM_TIPOS_INFORMADOS) {
    const r = resultadoDe(TIPOS_PRECO_INFORMADO[tipo].fonte as FonteMercadoChave);
    if (!r) continue;
    observacoes.push(
      `${r.total} preço(s) informado(s) — ${TIPOS_PRECO_INFORMADO[tipo].rotulo}; ${r.estatisticas.n} considerado(s) no cálculo.`
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
      comprasgov,
      bps,
      siasg,
      pncp,
      arp,
      similar: resultadoDe("similar"),
      midia: resultadoDe("midia"),
      orcamentos: resultadoDe("orcamentos"),
      notaFiscal: resultadoDe("notaFiscal"),
    },
    consolidado,
    orcamentos,
    descartes,
    recomendacao: {
      ...preco,
      mediaConsolidada: consolidado.porFonte.media,
      menorConsolidado: consolidado.porFonte.menor,
      metodologia: `${ROTULO_METODO[escolha.metodo].longo} (art. 6º da IN SEGES/ME nº 65/2021); teto = ${rotuloRegraTeto(escolha.regraTeto, escolha.aliquota)} (CMED ÷ Qt_Embal)`,
      fontes,
      observacoes,
    },
    periodo,
    ipca: {
      pedido: corrigirIpca,
      ligado: corrigirIpca && mesBase !== null,
      disponivel: !!tabelaIpca?.disponivel,
      mesBase: corrigirIpca ? mesBase : null,
      convencao: CONVENCAO_IPCA,
      semIndice,
    },
    duplicidades: marcasDuplicidade.size,
  };
}
