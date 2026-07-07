// Formatação e paleta do dashboard de Gastos SISMAT.
// Parsing dos dados é em formato inglês (ponto decimal); a EXIBIÇÃO é em pt-BR.

/** R$ 1.234.567 (sem centavos) — usado em KPIs, tooltips e tabela. */
export const fmtBRL = (v: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v ?? 0);

/** R$ 1,2 mi — compacto, para os eixos dos gráficos. */
export const fmtBRLCompact = (v: number): string =>
  new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v ?? 0);

/** Paleta categórica (15 cores distintas) — mesma do dashboard original. */
export const SISMAT_COLORS = [
  "#4dabf7",
  "#51cf66",
  "#ff922b",
  "#cc5de8",
  "#ffd43b",
  "#ff6b6b",
  "#22b8cf",
  "#94d82d",
  "#f783ac",
  "#748ffc",
  "#63e6be",
  "#e599f7",
  "#fab005",
  "#5c7cfa",
  "#20c997",
] as const;

/** Cinza para a fatia "Outros" e a linha "Total geral". */
export const SISMAT_GRAY = "#8b98a5";
export const SISMAT_OUTROS = "#3a4450";

/** Cores do fluxo Entradas × Saídas (aba Estoque). */
export const SISMAT_ENTRADA_COLOR = "#4dabf7"; // azul (entrou no estoque)
export const SISMAT_SAIDA_COLOR = "#ff922b"; // laranja (saiu do estoque)
export const SISMAT_SALDO_COLOR = "#51cf66"; // verde (saldo derivado)

export const colorAt = (i: number): string => SISMAT_COLORS[i % SISMAT_COLORS.length];
