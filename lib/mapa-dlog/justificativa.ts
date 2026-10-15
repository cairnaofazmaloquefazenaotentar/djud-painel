import {
  ROTULO_METODO,
  componenteCriterioDlog,
  rotuloRegraTetoCurto,
} from "@/lib/pesquisa-preco-metodo";
import type { ResultadoPesquisa } from "@/lib/pesquisa-preco";
import { subtrairMeses } from "@/lib/pesquisa-preco-periodo";

// ─────────────────────────────────────────────────────────────────────────────
// Justificativa do preço adotado, no padrão da DLOG (seção 8.4 da avaliação).
//
// Módulo puro: o texto sai dos números que a pesquisa já apurou e vai, igual,
// para a tela, para o relatório HTML e para o mapa XLSX (célula B14 da aba do
// item e bloco "JUSTIFICATIVA TÉCNICA"). O responsável pode editar o texto
// antes de emitir; o texto editado substitui este, e o log registra a edição.
// ─────────────────────────────────────────────────────────────────────────────

/** "R$ 1.234,56"; abaixo de R$ 1, quatro casas ("R$ 0,0123"). */
export function brl(v: number): string {
  const casas = Math.abs(v) < 1 ? 4 : 2;
  const [int, dec] = v.toFixed(casas).split(".");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "ago/2026" a partir de "2026-08" ou de uma data ISO. */
export function mesAno(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

/** "dd/mm/aaaa" de uma data ISO, sem depender do fuso do servidor. */
export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Contexto que a pesquisa não carrega e o relatório conhece (período, IPCA). */
export interface ContextoJustificativa {
  /** Período da pesquisa (art. 5º), datas ISO. */
  periodo?: { inicio: string; fim: string } | null;
  /** Mês-base da correção pelo IPCA ("2026-08"); null/ausente = sem correção. */
  ipcaMesBase?: string | null;
  /** Registros que não compõem por duplicidade entre bases (P18). */
  duplicados?: number;
}

/** Artigo + nome do método, para "adota-se a mediana" / "adota-se o menor valor". */
function comArtigo(metodo: keyof typeof ROTULO_METODO, componente: "media" | "mediana" | null): string {
  switch (metodo) {
    case "mediana_medianas":
      return "a mediana das medianas";
    case "media_registros":
      return "a média";
    case "mediana_registros":
      return "a mediana";
    case "menor_registros":
      return "o menor valor";
    case "criterio_dlog":
      return componente === "media" ? "a média" : "a mediana";
  }
}

export function gerarJustificativa(r: ResultadoPesquisa, contexto: ContextoJustificativa = {}): string {
  // Período, IPCA e duplicatas saem do próprio resultado: o mesmo texto na tela,
  // no HTML e no mapa, seja quem for o chamador.
  const ctx: ContextoJustificativa = {
    periodo:
      r.periodo && r.periodo.mesesMercado !== null
        ? { inicio: subtrairMeses(r.periodo.dataReferencia, r.periodo.mesesMercado), fim: r.periodo.dataReferencia }
        : null,
    ipcaMesBase: r.ipca?.ligado ? r.ipca.mesBase : null,
    duplicados: r.duplicidades ?? 0,
    ...contexto,
  };
  const rec = r.recomendacao;
  const { metodo, regraTeto, aliquota } = rec.escolha;
  const { porRegistro, porFonte, fontes } = r.consolidado;
  const componente = metodo === "criterio_dlog" ? componenteCriterioDlog(r.consolidado) : null;
  const precoMetodo = rec.precoReferencia;
  const teto = rec.teto;
  const regra = rotuloRegraTetoCurto(regraTeto, aliquota);
  const partes: string[] = [];

  // 1. O que o método apurou.
  if (precoMetodo !== null) {
    if (metodo === "mediana_medianas") {
      partes.push(
        `A mediana das medianas de ${porFonte.n} fonte(s) (${fontes.map((f) => f.nome).join(", ")}) foi ${brl(precoMetodo)}; cada fonte pesa igual no cálculo.`
      );
    } else if (metodo === "criterio_dlog" && porRegistro.media !== null && porRegistro.mediana !== null) {
      const nome = componente === "media" ? "média" : "mediana";
      partes.push(
        `O menor valor apurado na pesquisa foi a ${nome} (${brl(precoMetodo)}): média ${brl(porRegistro.media)} e mediana ${brl(porRegistro.mediana)} do conjunto único de ${porRegistro.n} preço(s).`
      );
    } else {
      partes.push(
        `${ROTULO_METODO[metodo].longo.replace(/^./, (c) => c.toUpperCase())}: ${brl(precoMetodo)} (${porRegistro.n} preço(s)).`
      );
    }
  }

  // 2. Confronto com o teto CMED.
  if (precoMetodo === null) {
    partes.push(
      teto
        ? `Não houve preço de mercado apurado nas fontes consultadas; adota-se o teto CMED (${brl(teto.valorUnitario)}/unidade, ${regra}).`
        : "Não houve preço apurado nas fontes consultadas nem há PMVG vigente para o item na unidade pesquisada; o preço deve ser obtido por outro parâmetro do art. 5º e justificado nos autos."
    );
  } else if (!teto) {
    partes.push(
      `Não há PMVG vigente para o item na unidade pesquisada; não se aplica teto regulatório e adota-se ${comArtigo(metodo, componente)}.`
    );
  } else if (rec.tetoAplicado) {
    partes.push(
      `O valor apurado (${brl(precoMetodo)}) excede o teto CMED (${brl(teto.valorUnitario)}/unidade, ${regra}); adota-se o teto regulatório.`
    );
  } else {
    partes.push(
      `Como ${brl(precoMetodo)} não ultrapassa o teto CMED (${brl(teto.valorUnitario)}/unidade, ${regra}), adota-se ${comArtigo(metodo, componente)}.`
    );
  }

  // 3. Amostra, período e correção.
  if (porRegistro.n > 0) {
    let amostra = `Foram considerados ${porRegistro.n} preço(s) de ${fontes.length} fonte(s)`;
    if (ctx.periodo) amostra += `, período ${dataBr(ctx.periodo.inicio)}–${dataBr(ctx.periodo.fim)}`;
    if (ctx.ipcaMesBase) amostra += `, corrigidos pelo IPCA até ${mesAno(ctx.ipcaMesBase)}`;
    amostra += ".";
    partes.push(amostra);
  }
  const outliers = Object.values(r.resultados).reduce(
    (s, f) => s + (f && "outliersRemovidos" in f ? f.outliersRemovidos : 0),
    0
  );
  const descartes = r.descartes.length;
  const duplicados = ctx.duplicados ?? 0;
  if (descartes || outliers || duplicados) {
    const itens = [
      descartes ? `${descartes} registro(s) desconsiderado(s) com justificativa` : null,
      outliers ? `${outliers} fora do intervalo interquartil (IQR)` : null,
      duplicados ? `${duplicados} duplicado(s) entre bases` : null,
    ].filter(Boolean);
    partes.push(`Ficaram fora do cálculo: ${itens.join("; ")}.`);
  }
  if (precoMetodo !== null && porRegistro.n < 3) {
    partes.push("Menos de 3 preços: justificar nos autos (art. 6º da IN SEGES/ME nº 65/2021).");
  }
  return partes.join(" ");
}
