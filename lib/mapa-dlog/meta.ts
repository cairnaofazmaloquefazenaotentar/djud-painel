import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getDataVersion } from "@/lib/data-version";
import { ROTULO_FILTRO, filtrosAtivos } from "@/lib/pesquisa-preco-filtros";
import type { ResultadoPesquisa } from "@/lib/pesquisa-preco";
import type { MapaItem } from "@/lib/mapa-dlog/dados";

// ─────────────────────────────────────────────────────────────────────────────
// Metadados do mapa XLSX que não vêm da pesquisa: a situação das bases do
// painel na emissão (para a aba Parâmetros e a aba CMED), o nome do arquivo e
// o hash do conteúdo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoBases {
  cmedVigencia: Date | null;
  cmedPublicacao: Date | null;
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

export async function contextoBases(): Promise<ContextoBases> {
  const [cmed, bps, siasg, pncp, versao] = await Promise.all([
    db.precoCmed.aggregate({ _max: { vigencia: true } }),
    db.precoBps.aggregate({ _min: { data: true }, _max: { data: true } }),
    db.precoSiasg.aggregate({ _min: { data: true }, _max: { data: true }, where: { acaoJudicial: true } }),
    db.precoPncp.aggregate({ _min: { data: true }, _max: { data: true } }),
    getDataVersion(["precoCmed", "precoBps", "precoSiasg", "precoPncp", "catmatItem", "cmedRegistro"]).catch(
      () => null
    ),
  ]);
  const vigencia = cmed._max.vigencia ?? null;
  return {
    cmedVigencia: vigencia,
    // A tela ainda lê PrecoCmed; a data oficial de publicação entra com a
    // seção 7 do prompt CMED mensal (competência e alíquota escolhidas).
    cmedPublicacao: null,
    versaoDados: versao,
    fontesConsultadas: [
      `CMED/ANVISA — tabela vigente no painel${vigencia ? ` (vigência ${vigencia.toISOString().slice(0, 10).split("-").reverse().join("/")})` : ""}; preço por embalagem ÷ Qt_Embal do registro ANVISA.`,
      `BPS — base carregada no painel, compras de ${faixa(bps._min.data, bps._max.data)}.`,
      `SIASG — compras com ação judicial, base carregada no painel, ${faixa(siasg._min.data, siasg._max.data)}.`,
      `PNCP — base carregada no painel, ${faixa(pncp._min.data, pncp._max.data)}.`,
      "Orçamentos diretos de fornecedor — informados pelo responsável e juntados ao processo (art. 5º, IV).",
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

/** UF e filtros opcionais aplicados, em texto, para a aba Parâmetros. */
export function recorteDoItem(r: ResultadoPesquisa | null): string {
  if (!r) return "";
  const partes = [r.uf ? `UF ${r.uf}` : null, ...filtrosAtivos(r.filtros).map((c) => `${ROTULO_FILTRO[c]} "${r.filtros[c]}"`)].filter(
    Boolean
  );
  return partes.join("; ");
}
