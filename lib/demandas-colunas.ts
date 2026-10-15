// ─────────────────────────────────────────────────────────────────────────────
// Colunas e agrupamentos da exportação de demandas (A2). Módulo puro: a modal
// "Exportar" da lista mostra os mesmos rótulos que saem no arquivo.
//
// Fora de propósito: o autor (paciente) e a descrição completa — dado pessoal
// e texto livre longo não vão para planilha por padrão.
// ─────────────────────────────────────────────────────────────────────────────

export const COLUNAS_EXPORT = [
  { id: "numero", rotulo: "Nº DJUD" },
  { id: "numeroProcesso", rotulo: "Nº Processo" },
  { id: "nupSei", rotulo: "Nº SEI" },
  { id: "titulo", rotulo: "Título" },
  { id: "principioAtivo", rotulo: "Princípio ativo (Redmine)" },
  { id: "medicamento", rotulo: "Medicamento" },
  { id: "status", rotulo: "Status" },
  { id: "pontoControle", rotulo: "Ponto de controle" },
  { id: "prioridade", rotulo: "Prioridade" },
  { id: "areaTematica", rotulo: "Grupo temático" },
  { id: "objetoAcao", rotulo: "Objeto da ação" },
  { id: "trfRegiao", rotulo: "TRF" },
  { id: "regiaoBrasil", rotulo: "Região" },
  { id: "ufResidencia", rotulo: "UF de residência" },
  { id: "formaCumprimento", rotulo: "Forma de cumprimento" },
  { id: "origemDemanda", rotulo: "Origem" },
  { id: "dataEntradaDJUD", rotulo: "Entrada no DJUD" },
  { id: "criadoEm", rotulo: "Criada em" },
  { id: "valorEstimado", rotulo: "Valor do depósito (R$)" },
  { id: "responsavel", rotulo: "Responsável" },
] as const;

export type ColunaExport = (typeof COLUNAS_EXPORT)[number]["id"];

export const ROTULO_COLUNA: Record<ColunaExport, string> = Object.fromEntries(
  COLUNAS_EXPORT.map((c) => [c.id, c.rotulo])
) as Record<ColunaExport, string>;

/** As colunas da lista que vêm marcadas na modal. */
export const COLUNAS_PADRAO: ColunaExport[] = [
  "numero",
  "numeroProcesso",
  "nupSei",
  "titulo",
  "principioAtivo",
  "status",
  "pontoControle",
  "prioridade",
  "areaTematica",
  "trfRegiao",
  "ufResidencia",
  "dataEntradaDJUD",
];

export const AGRUPAMENTOS = [
  { id: "status", rotulo: "Status" },
  { id: "areaTematica", rotulo: "Grupo temático" },
  { id: "regiaoBrasil", rotulo: "Região" },
  { id: "trfRegiao", rotulo: "TRF" },
  { id: "medicamento", rotulo: "Medicamento" },
] as const;

export type Agrupamento = (typeof AGRUPAMENTOS)[number]["id"];

export const FORMATOS_EXPORT = ["csv", "xlsx", "html"] as const;
export type FormatoExport = (typeof FORMATOS_EXPORT)[number];

export function lerColunas(bruto: string | null | undefined): ColunaExport[] {
  const validas = new Set<string>(COLUNAS_EXPORT.map((c) => c.id));
  const lista = String(bruto ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ColunaExport => validas.has(s));
  return lista.length ? Array.from(new Set(lista)) : COLUNAS_PADRAO;
}

export function lerAgrupamento(bruto: string | null | undefined): Agrupamento | null {
  return (AGRUPAMENTOS.find((a) => a.id === bruto)?.id ?? null) as Agrupamento | null;
}
