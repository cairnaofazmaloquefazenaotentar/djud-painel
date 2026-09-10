// ─────────────────────────────────────────────────────────────────────────────
// Pesquisa de Preços — estatística (art. 6º da IN SEGES/ME nº 65/2021),
// curadoria de registros e orçamentos diretos de fornecedor.
//
// Módulo puro, sem Prisma nem Zod, pelo mesmo motivo de
// lib/pesquisa-preco-filtros.ts: a tela é Client Component e precisa dos
// rótulos, dos limites e do cálculo para pré-visualizar o efeito de uma
// exclusão antes de gerar o relatório. lib/pesquisa-preco.ts reexporta tudo
// (`export *`), então o servidor continua importando de um lugar só.
//
// Três blocos:
//
//   1. Estatística — média, mediana e menor valor, os três métodos que o
//      art. 6º admite para o preço estimado. O relatório apresenta os três,
//      por fonte e consolidados; o preço que instrui o processo continua sendo
//      a mediana das medianas (ver METODO_ADOTADO).
//
//   2. Exclusão justificada — o art. 6º, §§ 1º e 2º manda desconsiderar
//      preços inexequíveis ou excessivamente elevados, "adotando-se critérios
//      fundamentados e descritos no processo". Por isso a justificativa é
//      obrigatória e o registro descartado continua no relatório, com o
//      motivo ao lado: rastreabilidade é do descarte, não só do que ficou.
//
//   3. Orçamento direto de fornecedor — fonte prevista no art. 5º, IV. Entra
//      no cálculo como uma fonte a mais (uma mediana no vetor consolidado),
//      podendo ser marcado como "somente registro" quando serve apenas para
//      instruir o processo.
// ─────────────────────────────────────────────────────────────────────────────

/** Método que define o preço estimado adotado pelo painel (art. 6º, caput). */
export const METODO_ADOTADO =
  "Mediana das medianas por fonte (art. 6º da IN SEGES/ME nº 65/2021); teto = menor PMVG unitário sem impostos (CMED ÷ Qt_Embal)";

// ── 1. Estatística ───────────────────────────────────────────────────────────

export interface Estatisticas {
  /** Quantos valores entraram no cálculo (já sem outliers e sem excluídos). */
  n: number;
  media: number | null;
  mediana: number | null;
  /** Menor valor — o terceiro método do art. 6º. */
  menor: number | null;
  maior: number | null;
  desvioPadrao: number | null;
  /** Desvio padrão ÷ média, em % — dispersão relativa da amostra. */
  coefVariacao: number | null;
}

export const ESTATISTICAS_VAZIAS: Estatisticas = {
  n: 0,
  media: null,
  mediana: null,
  menor: null,
  maior: null,
  desvioPadrao: null,
  coefVariacao: null,
};

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Média, mediana, menor, maior e dispersão de um conjunto de preços. */
export function calcularEstatisticas(valores: number[]): Estatisticas {
  const v = valores.filter((x) => Number.isFinite(x));
  if (!v.length) return { ...ESTATISTICAS_VAZIAS };
  const soma = v.reduce((a, b) => a + b, 0);
  const media = soma / v.length;
  // Desvio amostral (n−1): a amostra é um recorte das compras, não o universo.
  const desvioPadrao =
    v.length > 1
      ? Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / (v.length - 1))
      : null;
  return {
    n: v.length,
    media,
    mediana: mediana(v),
    menor: Math.min(...v),
    maior: Math.max(...v),
    desvioPadrao,
    coefVariacao: desvioPadrao != null && media > 0 ? (desvioPadrao / media) * 100 : null,
  };
}

/** Faixa aceita pelo IQR; null quando a amostra é pequena demais (< 4). */
export function limitesIqr(valores: number[]): { lo: number; hi: number } | null {
  if (valores.length < 4) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
}

// ── 2. Exclusão justificada de registros ─────────────────────────────────────

/** Fontes cujos registros individuais podem ser desconsiderados. */
export type FonteCurada = "bps" | "siasg" | "pncp" | "cmed" | "orcamentos";

export const NOME_FONTE_CURADA: Record<FonteCurada, string> = {
  bps: "BPS",
  siasg: "SIASG (judicial)",
  pncp: "PNCP",
  cmed: "CMED/ANVISA",
  orcamentos: "Orçamento direto de fornecedor",
};

const FONTES_CURADAS = Object.keys(NOME_FONTE_CURADA) as FonteCurada[];

/** Justificativa curta demais não é fundamentação — o art. 6º, §2º exige critério descrito. */
export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 300;
/** Teto de registros desconsiderados por pesquisa — evita "curar" a amostra inteira. */
export const MAX_EXCLUSOES = 200;

export interface ExclusaoRegistro {
  fonte: FonteCurada;
  /** id do registro na base de origem (RegistroMercado.id / RegistroCmedPreco.id). */
  id: string;
  /** Justificativa do descarte — vai impressa no relatório. */
  motivo: string;
}

export function motivoValido(motivo: string | null | undefined): boolean {
  const s = String(motivo ?? "").trim();
  return s.length >= MOTIVO_MIN && s.length <= MOTIVO_MAX;
}

/** Descarta entradas malformadas e deduplica por fonte+id, preservando a ordem. */
export function normalizarExclusoes(
  bruto: unknown
): ExclusaoRegistro[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const saida: ExclusaoRegistro[] = [];
  for (const e of bruto) {
    if (!e || typeof e !== "object") continue;
    const fonte = (e as ExclusaoRegistro).fonte;
    const id = String((e as ExclusaoRegistro).id ?? "").trim();
    const motivo = String((e as ExclusaoRegistro).motivo ?? "").trim().slice(0, MOTIVO_MAX);
    if (!FONTES_CURADAS.includes(fonte) || !id || !motivoValido(motivo)) continue;
    const chave = `${fonte}:${id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ fonte, id, motivo });
    if (saida.length >= MAX_EXCLUSOES) break;
  }
  return saida;
}

/** fonte → (id do registro → motivo). */
export function mapaExclusoes(exclusoes: ExclusaoRegistro[]): Map<FonteCurada, Map<string, string>> {
  const mapa = new Map<FonteCurada, Map<string, string>>();
  for (const f of FONTES_CURADAS) mapa.set(f, new Map());
  for (const e of exclusoes) mapa.get(e.fonte)!.set(e.id, e.motivo);
  return mapa;
}

/** Registro efetivamente descartado — o que o relatório imprime para rastreabilidade. */
export interface RegistroDescartado {
  fonte: FonteCurada;
  id: string;
  descricao: string;
  preco: number;
  /** ISO; null nos registros CMED, que não têm data de compra. */
  data: string | null;
  uf: string | null;
  fornecedor: string | null;
  motivo: string;
}

// ── 3. Orçamento direto de fornecedor (art. 5º, IV) ──────────────────────────

/** Teto de orçamentos por item — mais que isto vira base de preços, não cotação. */
export const MAX_ORCAMENTOS = 10;

export interface OrcamentoFornecedor {
  /** Estável dentro do item; gerado na tela ou pelo banco (CestaOrcamento.id). */
  id: string;
  /** Empresa que apresentou a proposta. */
  fornecedor: string;
  cnpj: string | null;
  /** Marca e fabricante do produto ofertado — exigidos no relatório. */
  marca: string | null;
  fabricante: string | null;
  /** Preço por unidade de fornecimento da pesquisa, em R$. */
  valorUnitario: number;
  /** Data da proposta (ISO, só a parte da data importa). */
  dataOrcamento: string;
  /** Validade da proposta (ISO) — opcional. */
  validade: string | null;
  /** Nº da proposta, do e-mail ou do documento SEI que a juntou ao processo. */
  documento: string | null;
  observacao: string | null;
  /** false = fica registrado no relatório, mas fora do cálculo. */
  considerarNoCalculo: boolean;
}

const soData = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const texto = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  return s || null;
};

/**
 * Aceita o que a tela e o banco mandam e devolve orçamentos utilizáveis.
 * Sem fornecedor, sem valor positivo ou sem data válida, a cotação não
 * instrui nada — é descartada em silêncio, como os filtros opcionais.
 */
export function normalizarOrcamentos(bruto: unknown): OrcamentoFornecedor[] {
  if (!Array.isArray(bruto)) return [];
  const saida: OrcamentoFornecedor[] = [];
  for (const [i, o] of bruto.entries()) {
    if (!o || typeof o !== "object") continue;
    const r = o as Partial<OrcamentoFornecedor>;
    const fornecedor = texto(r.fornecedor, 200);
    const valorUnitario = Number(r.valorUnitario);
    const dataOrcamento = soData(r.dataOrcamento);
    if (!fornecedor || !Number.isFinite(valorUnitario) || valorUnitario <= 0 || !dataOrcamento) {
      continue;
    }
    saida.push({
      id: texto(r.id, 60) ?? `orc-${i + 1}`,
      fornecedor,
      cnpj: texto(r.cnpj, 20),
      marca: texto(r.marca, 120),
      fabricante: texto(r.fabricante, 200),
      valorUnitario,
      dataOrcamento,
      validade: soData(r.validade),
      documento: texto(r.documento, 120),
      observacao: texto(r.observacao, 300),
      considerarNoCalculo: r.considerarNoCalculo !== false,
    });
    if (saida.length >= MAX_ORCAMENTOS) break;
  }
  return saida;
}
