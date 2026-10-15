// ─────────────────────────────────────────────────────────────────────────────
// Mapa comparativo de preços no modelo da DLOG — fonte única do layout.
//
// Abas, títulos, os 24 cabeçalhos da base de preços (texto idêntico ao da
// planilha da DLOG), larguras, alturas, formatos e a paleta.
//
// Exceção documentada à regra dos tokens do design system: o XLSX não lê CSS,
// então a paleta da DLOG fica aqui, em constantes, e só aqui — como o AZUL do
// relatório HTML em lib/relatorio-pesquisa-preco.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Paleta da planilha da DLOG (ARGB sem o alfa). */
export const COR = {
  azulEscuro: "1F4E79",
  azul: "2E75B6",
  azulClaro: "D6E3F8",
  verde: "548235",
  verdeClaro: "C6EFCE",
  cinza: "666666",
  abaIpca: "D8E8F6",
  branco: "FFFFFF",
  /** Cabeçalho das colunas que o painel acrescenta à direita do modelo. */
  cinzaPainel: "D9D9D9",
  borda: "BFBFBF",
} as const;

export const ABA = {
  consolidacao: "Consolidação",
  memoria: "MEMÓRIA DE CÁLCULO",
  ipca: "Índices IPCA",
  cmed: "CMED",
  parametros: "Parâmetros",
} as const;

/** "Item 1", "Item 2"… — sem espaço no fim (o modelo tinha "Item 5 "). */
export function abaItem(n: number): string {
  return `Item ${n}`;
}

/** Referência a outra aba numa fórmula: 'Item 1'!B2. */
export function ref(aba: string, celula: string): string {
  return `'${aba.replace(/'/g, "''")}'!${celula}`;
}

export const TITULO = {
  consolidacao: "CONSOLIDAÇÃO DE PESQUISA DE PREÇOS DE MEDICAMENTOS",
  consolidacaoSub: "Relatório Executivo para Instrução Processual",
  memoria: "MEMÓRIA DE CÁLCULO - PESQUISA DE PREÇOS",
  memoriaSub: "Detalhamento Estatístico e Justificativa Técnica para Adoção de Preços",
  ipca: "TABELA DE ÍNDICES IPCA - CORREÇÃO MONETÁRIA",
  ipcaFonte: "Fonte: IBGE - Instituto Brasileiro de Geografia e Estatística",
  cmed: "Secretaria Executiva - CMED",
  cmedSub: "LISTA DE PREÇOS DE MEDICAMENTOS - PREÇOS FÁBRICA E MÁXIMOS DE VENDA AO GOVERNO",
  dadosMedicamento: "DADOS DO MEDICAMENTO",
  resumo: "RESUMO ESTATÍSTICO",
  precoAdotado: "PREÇO ADOTADO",
  porFonte: "CONSOLIDADO POR FONTE (método do painel)",
  base: "BASE DE PREÇOS COLETADOS",
  justificativa: "JUSTIFICATIVA TÉCNICA",
} as const;

export const CABECALHO_CONSOLIDACAO = [
  "Item",
  "Medicamento",
  "CATMAT",
  "Quantidade",
  "Preço Adotado (R$)",
  "Método Estatístico",
  "Valor Total (R$)",
  "Status",
] as const;

export const LARGURA_CONSOLIDACAO = [16.9, 103.7, 8.9, 14.9, 20, 19, 17.9, 9.4];

export const CABECALHO_MEMORIA = [
  "Item",
  "Medicamento",
  "CATMAT",
  "Nº Preços",
  "Menor Valor",
  "Maior Valor",
  "Média",
  "Mediana",
  "Coef. Variação",
  "Método Escolhido",
  "Preço Adotado",
] as const;

export const LARGURA_MEMORIA = [10, 48, 9, 9, 14, 14, 14, 14, 11, 30, 15];

/**
 * Linha 17 das abas de item: os 24 cabeçalhos da DLOG, A a X, texto idêntico.
 * scripts/conferir_mapa_dlog.py compara com a planilha modelo.
 */
export const CABECALHO_BASE = [
  "Número do Item da Pesquisa",
  "Fonte da Pesquisa",
  "Número da Compra",
  "Data/Hora da Compra",
  "Data/Hora da Cotação",
  "Anulada/Revogada",
  "Número do Item da Compra",
  "Modalidade",
  "Critério Julgamento Item",
  "Código do Item",
  "Descrição do Item",
  "Unidade de Fornecimento",
  "Quantidade Ofertada",
  "Preço Unitário",
  "Identificação do Fornecedor",
  "Nome do Fornecedor / Identificação da Fonte",
  "Órgão",
  "UASG",
  "Nome UASG",
  "Referência",
  "Compõe a base de dados final",
  "Mês e Ano",
  "Índice de correção acumulado IPCA",
  "Preço unitário corrigido pelo IPCA",
] as const;

/** Colunas que o painel acrescenta à direita do modelo (Y em diante). */
export const CABECALHO_PAINEL = {
  motivo: "Motivo (quando não compõe)",
  identificador: "Identificador do registro no painel",
  precoConsiderado: "Preço considerado (auxiliar)",
  compoeFonte: "Compõe a estatística da fonte (auxiliar)",
  auxiliarFonte: (rotulo: string) => `Auxiliar — ${rotulo}`,
} as const;

/** Larguras A–Z das abas de item (o bloco de cima também usa A–F e H–M). */
export const LARGURA_ITEM = [
  20, 22, 15, 12, 15, 11, 10, 15, 13, 10, 48, 18, 11, 14, 17, 34, 30, 9, 30, 32, 11, 10, 12, 14, 34, 36,
];

/** Primeira linha de dados da base de preços (linha 17 = cabeçalho). */
export const LINHA_CABECALHO_BASE = 17;
export const PRIMEIRA_LINHA_BASE = 18;

export const ALTURA = {
  faixa: 3.75,
  cabecalhoBase: 68.25,
  cabecalhoCmed: 63.75,
  justificativaItem: 60,
  justificativaMemoria: 180,
} as const;

export const CABECALHO_CMED = [
  "SUBSTÂNCIA",
  "CNPJ",
  "LABORATÓRIO",
  "REGISTRO",
  "EAN 1",
  "PRODUTO",
  "APRESENTAÇÃO",
  "CLASSE TERAPÊUTICA",
  "TIPO DE PRODUTO (STATUS DO PRODUTO)",
  "REGIME DE PREÇO",
  "PMVG Sem Impostos",
  "PMVG 0 %",
] as const;

export const LARGURA_CMED = [28, 20, 30, 16, 16, 22, 40, 30, 16, 12, 14, 14, 14, 12, 16, 34];

export const CABECALHO_IPCA = [
  "Mês/Ano",
  "IPCA Mensal (%)",
  "Número-índice",
  "Fator até o mês-base",
  "IPCA acumulado até o mês-base (%)",
] as const;

export const FORMATO = {
  moeda: '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-',
  precoUnitario: '"R$" #,##0.00##',
  data: "dd/mm/yyyy",
  dataHora: "dd/mm/yyyy hh:mm",
  mesAno: "mmm/yyyy",
  percentual: "0.00%",
  inteiro: "#,##0",
  desvio: "#,##0.0000",
  fator: "0.000000",
} as const;

/** Texto usado nas colunas sem o dado na origem (E1: bases do painel). */
export const NAO_DISPONIVEL = "não disponível na base";
export const NAO_INFORMADO = "não informado";
