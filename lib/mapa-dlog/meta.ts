import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getDataVersion } from "@/lib/data-version";
import { ROTULO_FILTRO, filtrosAtivos } from "@/lib/pesquisa-preco-filtros";
import { descricaoPeriodo } from "@/lib/pesquisa-preco-periodo";
import { CONVENCAO_IPCA } from "@/lib/ipca";
import { carregarIpca } from "@/lib/ipca-indices";
import { fontesDoResultado } from "@/lib/pesquisa-preco-fontes";
import type { ResultadoPesquisa } from "@/lib/pesquisa-preco";
import type { MapaItem } from "@/lib/mapa-dlog/dados";
import { escolherLista, listarCompetencias } from "@/lib/cmed";
import { hojeBrasilia } from "@/lib/pesquisa-preco-periodo";
import type { MetaMapa } from "@/lib/mapa-dlog/gerar";

// ─────────────────────────────────────────────────────────────────────────────
// Metadados do mapa XLSX que não vêm da pesquisa: a situação das bases do
// painel na emissão (para a aba Parâmetros e a aba CMED), o nome do arquivo e
// o hash do conteúdo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoBases {
  cmedVigencia: Date | null;
  cmedPublicacao: Date | null;
  /** Lista mensal do teto ("ago/2026"): a última publicada até a data de referência. */
  cmedLista: string | null;
  versaoDados: string | null;
  fontesConsultadas: string[];
}

const ano = (d: Date | null | undefined) => (d ? String(d.getUTCFullYear()) : "—");

function faixa(min: Date | null | undefined, max: Date | null | undefined): string {
  if (!min || !max) return "sem registros";
  const a = ano(min);
  const b = ano(max);
  return a === b ? a : `${a}–${b}`;
}

/**
 * `dataReferencia` ("AAAA-MM-DD") escolhe a lista CMED pela mesma regra da
 * pesquisa (escolherLista): a última publicada até essa data.
 */
export async function contextoBases(dataReferencia: string = hojeBrasilia()): Promise<ContextoBases> {
  const [cmed, bps, siasg, pncp, versao, competencias] = await Promise.all([
    db.precoCmed.aggregate({ _max: { vigencia: true } }),
    db.precoBps.aggregate({ _min: { data: true }, _max: { data: true } }),
    db.precoSiasg.aggregate({ _min: { data: true }, _max: { data: true }, where: { acaoJudicial: true } }),
    db.precoPncp.aggregate({ _min: { data: true }, _max: { data: true } }),
    getDataVersion(["precoCmed", "precoBps", "precoSiasg", "precoPncp", "catmatItem", "cmedRegistro"]).catch(
      () => null
    ),
    listarCompetencias(),
  ]);
  const vigencia = cmed._max.vigencia ?? null;
  const lista = escolherLista(competencias, dataReferencia, null);
  return {
    cmedVigencia: vigencia,
    // As listas mensais não trazem a data oficial de publicação.
    cmedPublicacao: null,
    cmedLista: lista?.rotulo ?? null,
    versaoDados: versao,
    fontesConsultadas: [
      lista
        ? `CMED/ANVISA — lista de ${lista.rotulo}, a última publicada até a data de referência; preço por embalagem ÷ Qt_Embal do registro ANVISA.`
        : `CMED/ANVISA — tabela vigente no painel${vigencia ? ` (vigência ${vigencia.toISOString().slice(0, 10).split("-").reverse().join("/")})` : ""}; preço por embalagem ÷ Qt_Embal do registro ANVISA.`,
      `Compras.gov.br — uma fonte com três bases: a API de dados abertos do Painel de Preços (coletada por CATMAT), o SIASG/Comprasnet judicial carregado no painel (${faixa(siasg._min.data, siasg._max.data)}) e a base de contratos do PNCP carregada no painel (${faixa(pncp._min.data, pncp._max.data)}). O PNCP é também o link da contratação de cada compra (coluna Referência).`,
      `BPS — API de dados abertos do Ministério da Saúde quando coletado; senão, base carregada no painel, compras de ${faixa(bps._min.data, bps._max.data)}.`,
      "Atas de registro de preços — API de dados abertos do Compras.gov.br (vigência iniciada nos últimos 12 meses).",
      "Preços informados pelo responsável — cotação, mídia especializada, nota fiscal e contratação similar (art. 5º, II a V).",
      "Data/Hora da Cotação das bases do painel = data e hora da consulta na emissão deste arquivo.",
    ],
  };
}

/** Mapa_comparativo_de_Precos_<NUP só dígitos>_<aaaa-mm-dd>.xlsx */
export function nomeArquivoMapa(processo: string, geradoEm: Date): string {
  const digitos = processo.replace(/\D/g, "");
  const data = geradoEm.toISOString().slice(0, 10);
  return `Mapa_comparativo_de_Precos${digitos ? `_${digitos}` : ""}_${data}.xlsx`;
}

/** SHA-256 dos dados do mapa — muda se, e só se, algum número ou texto mudar. */
export function hashConteudo(itens: MapaItem[]): string {
  return createHash("sha256").update(JSON.stringify(itens)).digest("hex");
}

export function hashArquivo(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * IPCA para a aba "Índices IPCA": do mês mais antigo que foi corrigido até o
 * mês-base, com os números-índices da tabela (nunca digitados nem somados).
 */
export async function ipcaParaMapa(resultados: Array<ResultadoPesquisa | null>): Promise<MetaMapa["ipca"]> {
  const ligados = resultados.filter((r): r is ResultadoPesquisa => !!r?.ipca.ligado && !!r.ipca.mesBase);
  if (!ligados.length) return { ligado: false, mesBase: null, convencao: CONVENCAO_IPCA, indices: [] };
  const mesBase = ligados.map((r) => r.ipca.mesBase as string).sort().at(-1) as string;
  let maisAntigo = mesBase;
  for (const r of ligados) {
    for (const { dados } of fontesDoResultado(r)) {
      for (const reg of dados.registros) {
        if (reg.fatorIpca != null && reg.mesIndice && reg.mesIndice < maisAntigo) maisAntigo = reg.mesIndice;
      }
    }
  }
  const tabela = await carregarIpca();
  const indices = Array.from(tabela.indices.entries())
    .filter(([mes]) => mes >= maisAntigo && mes <= mesBase)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, numeroIndice]) => ({
      competencia: `${mes}-01`,
      numeroIndice,
      variacaoMensal: tabela.variacoes.get(mes) ?? null,
    }));
  return { ligado: true, mesBase, convencao: CONVENCAO_IPCA, indices };
}

/** Texto do período para a aba Parâmetros: o mesmo para todos os itens, ou por item. */
export function periodoParaMapa(resultados: Array<ResultadoPesquisa | null>): string {
  const textos = Array.from(new Set(resultados.filter((r): r is ResultadoPesquisa => !!r).map((r) => descricaoPeriodo(r.periodo))));
  if (!textos.length) return "—";
  return textos.length === 1 ? textos[0] : "Varia por item — ver as linhas de cada item abaixo.";
}

/** UF e filtros opcionais aplicados, em texto, para a aba Parâmetros. */
export function recorteDoItem(r: ResultadoPesquisa | null): string {
  if (!r) return "";
  const partes = [r.uf ? `UF ${r.uf}` : null, ...filtrosAtivos(r.filtros).map((c) => `${ROTULO_FILTRO[c]} "${r.filtros[c]}"`)].filter(
    Boolean
  );
  return partes.join("; ");
}
