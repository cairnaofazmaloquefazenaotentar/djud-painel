import { db } from "@/lib/db";
import { normalizarExclusoes } from "@/lib/pesquisa-preco-curadoria";
import type { ExclusaoRegistro, OrcamentoFornecedor } from "@/lib/pesquisa-preco-curadoria";
import type { ParametrosPesquisa, TipoCodigo } from "@/lib/pesquisa-preco";
import type { EscolhaPreco } from "@/lib/pesquisa-preco-metodo";

export { escolhaGravada } from "@/lib/pesquisa-preco-metodo";

// ─────────────────────────────────────────────────────────────────────────────
// Cesta de itens da Pesquisa de Preços — leitura e serialização.
//
// A cesta é do usuário logado (CestaItem.userId) e vive no banco justamente
// para sobreviver ao logout: quem adiciona itens e sai sem gerar o relatório
// encontra a mesma cesta ao entrar de novo, em qualquer máquina.
//
// Os preços gravados na linha são um snapshot do instante em que o item foi
// adicionado — servem para o total estimado na tela. O relatório consolidado
// refaz a pesquisa de cada item na data de emissão.
// ─────────────────────────────────────────────────────────────────────────────

export interface CestaItemDTO {
  id: string;
  codigo: string;
  tipo: TipoCodigo;
  catmat: string | null;
  descricao: string;
  unidade: string;
  uf: string | null;
  quantidade: number;
  observacao: string | null;
  precoReferencia: number | null;
  limitePmvg: number | null;
  precoFinal: number | null;
  /** precoFinal × quantidade — null quando não há preço apurado. */
  valorTotal: number | null;
  /** Registros desconsiderados com justificativa (art. 6º, §§ 1º e 2º). */
  exclusoes: ExclusaoRegistro[];
  /** Preços informados do item (art. 5º, II a V). */
  orcamentos: OrcamentoFornecedor[];
  /** Escolhas do responsável reaplicadas na emissão (avaliação da DLOG). */
  metodoPreco: string | null;
  regraTeto: string | null;
  aliquotaTeto: string | null;
  justificativa: string | null;
  /** 12, 24 ou 36; 0 = todo o período; null = padrão (12). */
  periodoMeses: number | null;
  /** Intervalo de datas: início das bases ("AAAA-MM-DD"); prevalece sobre periodoMeses. */
  periodoInicio: string | null;
  justificativaPeriodo: string | null;
  corrigirIpca: boolean;
  duplicidadesRevertidas: string[];
  calculadoEm: string;
  criadoEm: string;
}

export interface CestaResumo {
  itens: CestaItemDTO[];
  total: number;
  /** Soma de precoFinal × quantidade dos itens com preço. */
  valorTotal: number;
  /** Itens sem preço apurado — não entram no valor total. */
  itensSemPreco: number;
  /** Itens com alguma curadoria (exclusão, preço informado ou duplicata mantida) registrada. */
  itensCurados: number;
}

interface LinhaOrcamento {
  id: string;
  fornecedor: string;
  cnpj: string | null;
  marca: string | null;
  fabricante: string | null;
  valorUnitario: number;
  dataOrcamento: Date;
  validade: Date | null;
  documento: string | null;
  observacao: string | null;
  considerarNoCalculo: boolean;
  tipo: string;
  url: string | null;
  acessadoEm: Date | null;
  chaveNfe: string | null;
  justificativaForaPeriodo: string | null;
}

interface LinhaCesta {
  id: string;
  codigo: string;
  tipo: string;
  catmat: string | null;
  descricao: string;
  unidade: string;
  uf: string | null;
  quantidade: number;
  observacao: string | null;
  precoReferencia: number | null;
  limitePmvg: number | null;
  precoFinal: number | null;
  exclusoes: unknown;
  metodoPreco: string | null;
  regraTeto: string | null;
  aliquotaTeto: string | null;
  justificativa: string | null;
  periodoMeses: number | null;
  periodoInicio: string | null;
  justificativaPeriodo: string | null;
  corrigirIpca: boolean;
  duplicidadesRevertidas: unknown;
  calculadoEm: Date;
  criadoEm: Date;
  orcamentos?: LinhaOrcamento[];
}

export function orcamentoParaDTO(o: LinhaOrcamento): OrcamentoFornecedor {
  return {
    id: o.id,
    fornecedor: o.fornecedor,
    cnpj: o.cnpj,
    marca: o.marca,
    fabricante: o.fabricante,
    valorUnitario: o.valorUnitario,
    dataOrcamento: o.dataOrcamento.toISOString(),
    validade: o.validade ? o.validade.toISOString() : null,
    documento: o.documento,
    observacao: o.observacao,
    considerarNoCalculo: o.considerarNoCalculo,
    tipo: (["IV", "III", "V", "II"] as const).find((t) => t === o.tipo) ?? "IV",
    url: o.url,
    acessadoEm: o.acessadoEm ? o.acessadoEm.toISOString() : null,
    chaveNfe: o.chaveNfe,
    justificativaForaPeriodo: o.justificativaForaPeriodo,
  };
}

export function paraDTO(r: LinhaCesta): CestaItemDTO {
  return {
    id: r.id,
    codigo: r.codigo,
    tipo: r.tipo === "REGISTRO" ? "REGISTRO" : "CATMAT",
    catmat: r.catmat,
    descricao: r.descricao,
    unidade: r.unidade,
    uf: r.uf,
    quantidade: r.quantidade,
    observacao: r.observacao,
    precoReferencia: r.precoReferencia,
    limitePmvg: r.limitePmvg,
    precoFinal: r.precoFinal,
    valorTotal: r.precoFinal === null ? null : r.precoFinal * r.quantidade,
    // O JSONB pode ter sido gravado por uma versão anterior do formato — passa
    // pelo normalizador em vez de confiar no que está no banco.
    exclusoes: normalizarExclusoes(r.exclusoes),
    orcamentos: (r.orcamentos ?? []).map(orcamentoParaDTO),
    metodoPreco: r.metodoPreco,
    regraTeto: r.regraTeto,
    aliquotaTeto: r.aliquotaTeto,
    justificativa: r.justificativa,
    periodoMeses: r.periodoMeses,
    periodoInicio: r.periodoInicio,
    justificativaPeriodo: r.justificativaPeriodo,
    corrigirIpca: r.corrigirIpca,
    duplicidadesRevertidas: Array.isArray(r.duplicidadesRevertidas)
      ? r.duplicidadesRevertidas.map((x) => String(x))
      : [],
    calculadoEm: r.calculadoEm.toISOString(),
    criadoEm: r.criadoEm.toISOString(),
  };
}

export function resumir(itens: CestaItemDTO[]): CestaResumo {
  let valorTotal = 0;
  let itensSemPreco = 0;
  let itensCurados = 0;
  for (const i of itens) {
    if (i.valorTotal === null) itensSemPreco += 1;
    else valorTotal += i.valorTotal;
    if (i.exclusoes.length > 0 || i.orcamentos.length > 0 || i.duplicidadesRevertidas.length > 0) itensCurados += 1;
  }
  return { itens, total: itens.length, valorTotal, itensSemPreco, itensCurados };
}

/**
 * Parâmetros da pesquisa de um item da cesta: a curadoria e as escolhas
 * gravadas no item, com a data de referência da emissão (D1). `escolha` é a
 * da modal de emissão ou a gravada no item; o que faltar segue o padrão.
 */
export function parametrosDoItem(
  c: CestaItemDTO,
  dataReferencia: string,
  escolha: Partial<EscolhaPreco> | null | undefined
): ParametrosPesquisa {
  return {
    codigo: c.codigo,
    unidade: c.unidade,
    uf: c.uf,
    exclusoes: c.exclusoes,
    orcamentos: c.orcamentos,
    escolha,
    periodo: {
      dataReferencia,
      mesesMercado: c.periodoMeses === 0 ? null : c.periodoMeses === 24 || c.periodoMeses === 36 ? c.periodoMeses : 12,
      justificativaAmpliacao: c.justificativaPeriodo,
      inicio: c.periodoInicio,
    },
    corrigirIpca: c.corrigirIpca,
    duplicidadesRevertidas: c.duplicidadesRevertidas,
  };
}

/** Itens da cesta do usuário, na ordem em que foram adicionados. */
export async function listarCesta(userId: string): Promise<CestaResumo> {
  const rows = await db.cestaItem.findMany({
    where: { userId },
    orderBy: { criadoEm: "asc" },
    include: { orcamentos: { orderBy: { criadoEm: "asc" } } },
  });
  return resumir(rows.map(paraDTO));
}
