// ─────────────────────────────────────────────────────────────────────────────
// Atualização monetária pelo IPCA (obs. 6 da DLOG; parâmetro P10). Módulo puro.
//
//   • Mês-base = o último mês com índice publicado, não posterior ao mês
//     anterior à data de referência.
//   • Fator = número-índice do mês-base ÷ número-índice do mês do preço — a
//     correção começa no mês SEGUINTE ao do preço (o próprio mês não entra).
//     A planilha da DLOG incluía o próprio mês: convenção a confirmar (P10).
//   • Fator composto (razão dos números-índices), nunca a soma das variações
//     mensais — a soma era o erro 1 da seção 8.5.
//   • Sem índice para o mês do preço: fator 1, com sinalização.
//   • Só corrige os incisos I e II (sistemas oficiais, atas e contratações
//     similares, inclusive a informada pelo responsável), os que o art. 5º
//     manda observar "o índice de atualização de preços correspondente".
//     Mídia, cotação e nota fiscal (III, IV e V) ficam no valor informado; o
//     teto CMED nunca é corrigido (corrigidoPeloIpca em pesquisa-preco-fontes).
// ─────────────────────────────────────────────────────────────────────────────

/** "AAAA-MM" → número-índice (dez/1993 = 100). */
export type IndicesIpca = Map<string, number>;

export const CONVENCAO_IPCA =
  "Fator = número-índice do mês-base ÷ número-índice do mês da compra (IBGE/SIDRA, tabela 1737), aplicado ao valor do registro de compra: a variação conta a partir do mês seguinte ao da compra.";

export interface FatorIpca {
  fator: number;
  /** "AAAA-MM" do preço. */
  mesPreco: string;
  mesBase: string;
  /** Mês do preço sem número-índice na tabela: fator 1, sinalizado. */
  semIndice: boolean;
}

/** "AAAA-MM-DD" → "AAAA-MM" do mês anterior. */
export function mesAnterior(data: string): string {
  const [a, m] = data.split("-").map(Number);
  const total = a * 12 + (m - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Último mês com índice, não posterior ao mês anterior à data de referência. */
export function mesBaseIpca(dataReferencia: string, indices: IndicesIpca): string | null {
  const limite = mesAnterior(dataReferencia);
  let melhor: string | null = null;
  for (const mes of indices.keys()) {
    if (mes <= limite && (melhor === null || mes > melhor)) melhor = mes;
  }
  return melhor;
}

export function fatorIpca(mesPreco: string, mesBase: string, indices: IndicesIpca): FatorIpca {
  if (mesPreco >= mesBase) return { fator: 1, mesPreco, mesBase, semIndice: false };
  const base = indices.get(mesBase);
  const preco = indices.get(mesPreco);
  if (!base || !preco) return { fator: 1, mesPreco, mesBase, semIndice: true };
  return { fator: base / preco, mesPreco, mesBase, semIndice: false };
}
