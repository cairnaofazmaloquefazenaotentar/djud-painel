import { INFO_FONTE, type FonteMercadoChave, type Inciso } from "@/lib/pesquisa-preco-fontes";

// ─────────────────────────────────────────────────────────────────────────────
// Período da pesquisa de preços (art. 5º da IN SEGES/ME nº 65/2021; obs. 5 da
// DLOG; parâmetro P9). Módulo puro: a tela mostra o período antes de pesquisar
// e o servidor aplica o mesmo recorte.
//
//   • Sistemas oficiais e contratações similares (incisos I e II) e notas
//     fiscais (V): 12 meses antes da data de referência.
//   • Mídia especializada (III) e pesquisa direta com fornecedor (IV): 6 meses.
//   • Data de referência = data da pesquisa (editável); na cesta, a da emissão.
//   • Sem ampliação automática: ampliar as bases para 24 ou 36 meses, ou para
//     todo o período, exige justificativa (mínimo de 20 caracteres), impressa no
//     relatório e gravada no log.
//   • Intervalo de datas (pedido da DLOG): as bases de "inicio" até a data de
//     referência. Mais longo que 12 meses = ampliação (pede justificativa);
//     mais curto, não.
// ─────────────────────────────────────────────────────────────────────────────

/** Janela das bases (incisos I e II): 12 é o padrão; null = todo o período. */
export type MesesMercado = 12 | 24 | 36 | null;

export const OPCOES_MESES: Array<{ valor: MesesMercado; rotulo: string }> = [
  { valor: 12, rotulo: "12 meses (padrão do art. 5º)" },
  { valor: 24, rotulo: "24 meses (ampliação justificada)" },
  { valor: 36, rotulo: "36 meses (ampliação justificada)" },
  { valor: null, rotulo: "Todo o período (ampliação justificada)" },
];

export const JUSTIFICATIVA_PERIODO_MIN = 20;

/** Janela de cada inciso, em meses (P9). */
export const JANELA_POR_INCISO: Record<Inciso, 6 | 12> = { I: 12, II: 12, III: 6, IV: 6, V: 12 };

export type PeriodoPesquisa = {
  /** "AAAA-MM-DD". */
  dataReferencia: string;
  mesesMercado: MesesMercado;
  justificativaAmpliacao: string | null;
  /** Intervalo de datas: início das bases ("AAAA-MM-DD"); prevalece sobre `mesesMercado`. */
  inicio?: string | null;
};

/** Hoje em Brasília, "AAAA-MM-DD" (o servidor roda em UTC). */
export function hojeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

function dataValida(s: unknown): string | null {
  const t = String(s ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
}

export function normalizarPeriodo(bruto: unknown, hoje = hojeBrasilia()): PeriodoPesquisa {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const ref = dataValida(b.dataReferencia);
  // Data de referência no futuro não faz sentido para pesquisa de preço praticado.
  const dataReferencia = ref && ref <= hoje ? ref : hoje;
  const m = b.mesesMercado;
  const mesesMercado: MesesMercado = m === null ? null : m === 24 || m === "24" ? 24 : m === 36 || m === "36" ? 36 : 12;
  const just = String(b.justificativaAmpliacao ?? "").trim().replace(/\s+/g, " ").slice(0, 1000);
  const inicio = dataValida(b.inicio);
  return {
    dataReferencia,
    mesesMercado,
    justificativaAmpliacao: just || null,
    inicio: inicio && inicio <= dataReferencia ? inicio : null,
  };
}

/** Início da janela das bases (incisos I e II); null = todo o período. */
export function inicioDasBases(p: PeriodoPesquisa): string | null {
  if (p.inicio) return p.inicio;
  return p.mesesMercado === null ? null : subtrairMeses(p.dataReferencia, p.mesesMercado);
}

/** Janela das bases mais longa que os 12 meses do art. 5º. */
export function periodoAmpliado(p: PeriodoPesquisa): boolean {
  const inicio = inicioDasBases(p);
  return inicio === null || inicio < subtrairMeses(p.dataReferencia, 12);
}

/** Mensagem de erro, ou null quando o período pode ser aplicado. */
export function validarPeriodo(p: PeriodoPesquisa): string | null {
  if (periodoAmpliado(p) && (p.justificativaAmpliacao ?? "").length < JUSTIFICATIVA_PERIODO_MIN) {
    return `Ampliar o período além de 12 meses exige justificativa (mínimo de ${JUSTIFICATIVA_PERIODO_MIN} caracteres), que vai impressa no relatório.`;
  }
  return null;
}

/** "AAAA-MM-DD" menos N meses, no mesmo dia (último dia do mês quando não existe). */
export function subtrairMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const total = a * 12 + (m - 1) - meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export interface JanelaFonte {
  /** null = sem limite inferior (todo o período). */
  inicio: string | null;
  fim: string;
  /** Meses da janela; null = todo o período ou intervalo de datas (`personalizado`). */
  meses: number | null;
  inciso: Inciso;
  /** Intervalo de datas escolhido pelo responsável. */
  personalizado?: boolean;
}

/** Janela de uma fonte: bases seguem o período escolhido; preços informados, o do seu inciso. */
export function janelaDaFonte(fonte: FonteMercadoChave, p: PeriodoPesquisa): JanelaFonte {
  const info = INFO_FONTE[fonte];
  if (info.informado) {
    const meses = JANELA_POR_INCISO[info.inciso];
    return { inicio: subtrairMeses(p.dataReferencia, meses), fim: p.dataReferencia, meses, inciso: info.inciso };
  }
  if (p.inicio) {
    return { inicio: p.inicio, fim: p.dataReferencia, meses: null, inciso: info.inciso, personalizado: true };
  }
  const meses = p.mesesMercado;
  return {
    inicio: meses === null ? null : subtrairMeses(p.dataReferencia, meses),
    fim: p.dataReferencia,
    meses,
    inciso: info.inciso,
  };
}

/** Período por fonte, para a aba Parâmetros e o relatório. */
export function descricaoPeriodo(p: PeriodoPesquisa): string {
  const base = p.inicio
    ? `intervalo de ${dataBr(p.inicio)} a ${dataBr(p.dataReferencia)}`
    : p.mesesMercado === null
      ? "todo o período disponível"
      : `${p.mesesMercado} meses (de ${dataBr(subtrairMeses(p.dataReferencia, p.mesesMercado))} a ${dataBr(p.dataReferencia)})`;
  return `Data de referência ${dataBr(p.dataReferencia)}. Bases de preços (incisos I e II): ${base}${
    periodoAmpliado(p) ? ` — ampliado com justificativa: "${p.justificativaAmpliacao ?? ""}"` : ""
  }. Preços informados: mídia especializada e cotação com fornecedor (incisos III e IV), 6 meses; contratação similar (II) e nota fiscal (V), 12 meses.`;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
