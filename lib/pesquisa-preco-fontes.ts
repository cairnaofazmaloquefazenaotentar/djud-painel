import type { FonteCurada } from "@/lib/pesquisa-preco-curadoria";
import type { FonteMercadoResultado, ResultadoPesquisa } from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Fontes de mercado da Pesquisa de Preços e o inciso do art. 5º da IN SEGES/ME
// nº 65/2021 a que cada uma pertence.
//
// Módulo puro (só tipos e constantes), como lib/pesquisa-preco-filtros.ts: a
// tela, o relatório HTML e o mapa XLSX no modelo da DLOG precisam dos mesmos
// rótulos e da mesma ordem, e a tela é Client Component.
//
// A ordem é a do art. 5º (o §1º manda priorizar os incisos I e II) e, dentro
// do inciso, a de prevalência na deduplicação entre bases (P18): a mesma
// compra no Compras.gov.br, no SIASG e no PNCP fica com a primeira.
// ─────────────────────────────────────────────────────────────────────────────

/** Fontes de mercado: tudo o que forma preço, exceto a CMED (teto). */
export type FonteMercadoChave = Exclude<FonteCurada, "cmed">;

export type Inciso = "I" | "II" | "III" | "IV" | "V";

export interface InfoFonte {
  /** Nome na tela e no relatório HTML. */
  nome: string;
  /** Rótulo da coluna "Fonte da Pesquisa" do mapa da DLOG. */
  rotulo: string;
  inciso: Inciso;
  /**
   * Janela padrão do art. 5º, em meses: 12 para sistemas oficiais, contratações
   * similares e notas fiscais (I, II e V); 6 para mídia especializada e
   * pesquisa direta com fornecedor (III e IV).
   */
  janelaMeses: 6 | 12;
  /** Registro informado pelo responsável (não consultado em base). */
  informado: boolean;
}

export const INFO_FONTE: Record<FonteMercadoChave, InfoFonte> = {
  comprasgov: {
    nome: "Compras.gov.br — Painel de Preços",
    rotulo: "I - Compras.gov.br",
    inciso: "I",
    janelaMeses: 12,
    informado: false,
  },
  bps: { nome: "BPS", rotulo: "I - BPS", inciso: "I", janelaMeses: 12, informado: false },
  siasg: {
    nome: "SIASG (judicial)",
    rotulo: "I - SIASG (judicial)",
    inciso: "I",
    janelaMeses: 12,
    informado: false,
  },
  pncp: { nome: "PNCP", rotulo: "II - PNCP", inciso: "II", janelaMeses: 12, informado: false },
  arp: {
    nome: "Ata de registro de preços",
    rotulo: "II - Ata de Registro de Preços",
    inciso: "II",
    janelaMeses: 12,
    informado: false,
  },
  similar: {
    nome: "Contratação similar informada",
    rotulo: "II - Contratação similar",
    inciso: "II",
    janelaMeses: 12,
    informado: true,
  },
  midia: {
    nome: "Mídia especializada / sítio eletrônico",
    rotulo: "III - Mídia especializada",
    inciso: "III",
    janelaMeses: 6,
    informado: true,
  },
  orcamentos: {
    nome: "Orçamento direto de fornecedor",
    rotulo: "IV - Cotação com fornecedor",
    inciso: "IV",
    janelaMeses: 6,
    informado: true,
  },
  notaFiscal: {
    nome: "Nota fiscal eletrônica",
    rotulo: "V - Nota fiscal eletrônica",
    inciso: "V",
    janelaMeses: 12,
    informado: true,
  },
};

/**
 * Identificação da contratação de onde veio o preço (obs. 7 da DLOG; D3). As
 * bases carregadas no painel não trazem esses campos: `indisponivel` diz por
 * quê, e o relatório imprime o motivo em vez de deixar a célula vazia.
 */
export interface ContratacaoRef {
  /** "Pregão", "Dispensa", "Ata de registro de preços", "Processo"… */
  tipo: string | null;
  /** Nº da compra no formato do Compras.gov.br ("90041/2026") ou da ata. */
  numero: string | null;
  uasg: string | null;
  nomeUasg: string | null;
  /** Nº do item na compra. */
  numeroItem: string | null;
  /** Nº do processo administrativo do comprador. */
  processo: string | null;
  criterioJulgamento: string | null;
  /** Situação da contratação ou do item (homologado, anulado, revogado…). */
  situacao: string | null;
  numeroControlePncp: string | null;
  numeroControlePncpAta: string | null;
  /** Página pública (PNCP) da contratação ou da ata. */
  url: string | null;
  indisponivel: string | null;
}

/** Cópia do mesmo registro numa fonte que prevalece na deduplicação (P18). */
export interface DuplicidadeRef {
  fonte: FonteMercadoChave;
  id: string;
  /** true = casamento por regra (BPS); false = mesma chave do item da compra. */
  provavel: boolean;
}

/** Ordem de apresentação e de prevalência na deduplicação. */
export const ORDEM_FONTES: FonteMercadoChave[] = [
  "comprasgov",
  "bps",
  "siasg",
  "pncp",
  "arp",
  "similar",
  "midia",
  "orcamentos",
  "notaFiscal",
];

export interface FonteDoResultado {
  fonte: FonteMercadoChave;
  info: InfoFonte;
  dados: FonteMercadoResultado;
}

/**
 * Fontes de mercado presentes no resultado, na ordem do art. 5º. Fonte que a
 * pesquisa não trouxe (ainda sem coleta, ou sem preço informado) fica de fora.
 */
export function fontesDoResultado(r: ResultadoPesquisa): FonteDoResultado[] {
  const saida: FonteDoResultado[] = [];
  for (const fonte of ORDEM_FONTES) {
    const dados = r.resultados[fonte];
    if (dados) saida.push({ fonte, info: INFO_FONTE[fonte], dados });
  }
  return saida;
}
