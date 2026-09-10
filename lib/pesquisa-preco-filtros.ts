// ─────────────────────────────────────────────────────────────────────────────
// Filtros opcionais da Pesquisa de Preços — "Mais filtros" da tela.
//
// Módulo separado de lib/pesquisa-preco.ts de propósito: a página é um Client
// Component e precisa do rótulo dos filtros e da máscara de CNPJ. Importar
// lib/pesquisa-preco.ts de lá arrastaria o Prisma (lib/db) para o bundle do
// navegador. Aqui não há dependência nenhuma — só tipos e funções puras.
//
// lib/pesquisa-preco.ts reexporta tudo o que está aqui, então o servidor
// continua importando de um lugar só.
// ─────────────────────────────────────────────────────────────────────────────

/** Fontes de mercado consultadas por código CATMAT (a CMED é tratada à parte). */
export type FonteMercado = "bps" | "siasg" | "pncp";

// ── Filtros opcionais (fornecedor, fabricante, CNPJ do comprador) ────────────
//
// Não entram na regra dos três filtros obrigatórios: são um recorte adicional
// sobre o mesmo conjunto de registros. Fornecedor e fabricante casam por trecho
// do nome (case-insensitive); o CNPJ do comprador aceita o número completo ou
// só a raiz, com ou sem pontuação.
//
// Nem toda base tem os três campos. A fonte que NÃO tem o campo é excluída da
// consulta enquanto o filtro correspondente estiver ativo — devolver os
// registros dela sem filtrar, ao lado dos das outras já filtrados, falsearia a
// mediana das medianas que instrui o processo. O motivo vai para
// `filtrosNaoSuportados` da fonte e para as observações da recomendação.
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltrosOpcionais {
  fornecedor: string | null;
  fabricante: string | null;
  /** Sempre pontuado (00.000.000/0000-00), completo ou parcial a partir da raiz. */
  cnpjComprador: string | null;
}

export type CampoFiltro = keyof FiltrosOpcionais;

export const ROTULO_FILTRO: Record<CampoFiltro, string> = {
  fornecedor: "Fornecedor",
  fabricante: "Fabricante",
  cnpjComprador: "CNPJ do comprador",
};

export const NOME_FONTE: Record<FonteMercado, string> = {
  bps: "BPS",
  siasg: "SIASG",
  pncp: "PNCP",
};

/**
 * Campos que a base não possui (coluna ausente no schema Prisma):
 *   • PrecoSiasg guarda o CNPJ do fornecedor, nunca o do órgão comprador.
 *   • PrecoPncp não traz o fabricante do item, só o fornecedor da compra.
 * Colunas que existem mas ainda estão vazias na carga atual (fabricante no
 * SIASG, fornecedor/cnpjOrgao no PNCP) NÃO entram aqui de propósito: elas são
 * consultadas normalmente e passam a filtrar sozinhas quando os dados chegarem.
 */
export const FONTE_SEM_CAMPO: Record<FonteMercado, CampoFiltro[]> = {
  bps: [],
  siasg: ["cnpjComprador"],
  pncp: ["fabricante"],
};

/** Texto de filtro utilizável: aparado e com no mínimo 2 caracteres. */
function filtroTexto(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s.length >= 2 ? s : null;
}

/** Formata os dígitos que houver no padrão 00.000.000/0000-00 (aceita parcial). */
export function formatarCnpj(digitos: string): string {
  const d = String(digitos ?? "").replace(/\D/g, "").slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `.${d.slice(2, 5)}`;
  if (d.length > 5) out += `.${d.slice(5, 8)}`;
  if (d.length > 8) out += `/${d.slice(8, 12)}`;
  if (d.length > 12) out += `-${d.slice(12, 14)}`;
  return out;
}

/**
 * Formas de gravação do CNPJ nas bases: o BPS guarda pontuado
 * ("08.703.778/0001-79") e outras cargas guardam só dígitos
 * ("00134789000173"). O casamento é por prefixo para aceitar a raiz de 8.
 */
export function variantesCnpj(cnpj: string | null | undefined): string[] | null {
  const digitos = String(cnpj ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return Array.from(new Set([digitos, formatarCnpj(digitos)]));
}

/** Normaliza a entrada do usuário; CNPJ com menos de 8 dígitos é descartado. */
export function normalizarFiltros(f: Partial<FiltrosOpcionais> | null | undefined): FiltrosOpcionais {
  const digitos = String(f?.cnpjComprador ?? "").replace(/\D/g, "");
  return {
    fornecedor: filtroTexto(f?.fornecedor),
    fabricante: filtroTexto(f?.fabricante),
    cnpjComprador: digitos.length >= 8 ? formatarCnpj(digitos) : null,
  };
}

export function filtrosAtivos(f: FiltrosOpcionais): CampoFiltro[] {
  return (Object.keys(ROTULO_FILTRO) as CampoFiltro[]).filter((c) => f[c] != null);
}
