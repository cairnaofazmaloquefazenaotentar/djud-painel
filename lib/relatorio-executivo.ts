import { AZUL, esc, fmtDate, fmtInt, secao, type Coluna } from "@/lib/relatorio-pesquisa-preco";
import type { MetricsData } from "@/lib/metrics";
import type { LinhaRanking, RankingAnual, RankingAnualData } from "@/lib/metrics-ranking-anual";
import {
  blocosRankingAnual,
  brl,
  rotuloCategoria,
  cartao,
  csvDeBlocos,
  documentoHTML,
  num,
  tabelaRecorte,
  tabelaSimples,
  type BlocoCsv,
  type ContextoExport,
} from "@/lib/metrics-export";

// ─────────────────────────────────────────────────────────────────────────────
// Panorama Executivo (Frente C da avaliação da DLOG) — a visão do gestor sobre
// o mesmo recorte do Dashboard. Módulo puro: recebe o que getMetricsData e
// getRankingAnual já apuraram e só deriva participações (%) e a comparação dos
// últimos 12 meses com os 12 anteriores. Nenhum número novo é consultado
// aqui — por isso o panorama bate com o Dashboard sob os mesmos filtros.
//
// Os destaques são frases montadas dos números, sem juízo: quem lê decide o
// que é bom ou ruim.
// ─────────────────────────────────────────────────────────────────────────────

/** "2026-03" a partir do mês truncado (DATE_TRUNC devolve meia-noite UTC). */
const chaveMes = (d: Date | string) => new Date(d).toISOString().slice(0, 7);
const rotuloMes = (k: string) => `${k.slice(5, 7)}/${k.slice(0, 4)}`;

function somarMeses(k: string, n: number): string {
  const [a, m] = k.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);
const fmtPct = (v: number, dec = 1) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;

/** Quantas linhas de cada lista o relatório mostra (a planilha traz todas). */
const TOP_LISTA = 10;
const TOP_RANKING = 5;
/** Exercícios exibidos no ranking por ano do HTML (o A4 não comporta mais). */
const ANOS_HTML = 5;

export interface Comparacao12Meses {
  inicio: string;
  fim: string;
  inicioAnterior: string;
  fimAnterior: string;
  atual: number;
  anterior: number;
  /** null quando os 12 meses anteriores não têm processo (sem base para %). */
  variacao: number | null;
  /** Último mês da série: fica de fora por poder estar incompleto. */
  mesExcluido: string;
}

export interface LinhaAnual {
  ano: number;
  processos: number;
  valor: number;
}

export interface Panorama {
  comparacao: Comparacao12Meses | null;
  /** Por que não houve comparação. */
  semComparacao: string | null;
  anual: LinhaAnual[];
  /** Último mês com processo e com pagamento no SIAFI — o ano dele é parcial. */
  ultimoMesProcessos: string | null;
  ultimoMesValor: string | null;
  destaques: string[];
}

function serieMensal(pontos: Array<{ mes: string; v: number }>): Map<string, number> {
  const serie = new Map<string, number>();
  for (const p of pontos) serie.set(p.mes, (serie.get(p.mes) ?? 0) + p.v);
  return serie;
}

function somar(serie: Map<string, number>, de: string, ate: string): number {
  let total = 0;
  for (const [mes, v] of serie) if (mes >= de && mes <= ate) total += v;
  return total;
}

/**
 * Últimos 12 meses completos × os 12 anteriores, pela data de criação (o eixo
 * da série do Dashboard). O mês mais recente da série não entra: a base pode
 * ter sido carregada no meio dele. Sem 24 meses completos antes dele, não há
 * comparação — 12 contra 7 meses daria uma "alta" que é só falta de dado.
 */
function compararUltimos12(serie: Map<string, number>): { comparacao: Comparacao12Meses | null; motivo: string | null } {
  const meses = Array.from(serie.keys()).sort();
  if (!meses.length) return { comparacao: null, motivo: "Sem processos no recorte." };
  const mesExcluido = meses[meses.length - 1];
  const fim = somarMeses(mesExcluido, -1);
  const inicio = somarMeses(fim, -11);
  const fimAnterior = somarMeses(inicio, -1);
  const inicioAnterior = somarMeses(fimAnterior, -11);
  if (meses[0] > inicioAnterior) {
    return {
      comparacao: null,
      motivo: `A série do recorte começa em ${rotuloMes(meses[0])}: a comparação pede 24 meses completos antes de ${rotuloMes(mesExcluido)} (desde ${rotuloMes(inicioAnterior)}).`,
    };
  }
  const atual = somar(serie, inicio, fim);
  const anterior = somar(serie, inicioAnterior, fimAnterior);
  return {
    comparacao: {
      inicio,
      fim,
      inicioAnterior,
      fimAnterior,
      atual,
      anterior,
      variacao: anterior > 0 ? ((atual - anterior) / anterior) * 100 : null,
      mesExcluido,
    },
    motivo: null,
  };
}

export function calcularPanorama(m: MetricsData): Panorama {
  const processos = serieMensal(m.demandasTimeline.map((d) => ({ mes: chaveMes(d.date), v: d.count })));
  const valores = serieMensal(m.valorTimeline.map((d) => ({ mes: chaveMes(d.mes), v: d.valor })));
  const { comparacao, motivo } = compararUltimos12(processos);

  const porAno = new Map<number, LinhaAnual>();
  const linhaDoAno = (ano: number) => {
    const l = porAno.get(ano) ?? { ano, processos: 0, valor: 0 };
    porAno.set(ano, l);
    return l;
  };
  for (const [mes, v] of processos) linhaDoAno(Number(mes.slice(0, 4))).processos += v;
  for (const [mes, v] of valores) linhaDoAno(Number(mes.slice(0, 4))).valor += v;
  const anual = Array.from(porAno.values()).sort((a, b) => a.ano - b.ano);

  const ultimo = (s: Map<string, number>) => Array.from(s.keys()).sort().pop() ?? null;

  return {
    comparacao,
    semComparacao: motivo,
    anual,
    ultimoMesProcessos: ultimo(processos),
    ultimoMesValor: ultimo(valores),
    destaques: destaques(m, comparacao),
  };
}

function destaques(m: MetricsData, c: Comparacao12Meses | null): string[] {
  const total = m.totalDemandas;
  if (total === 0) return ["Nenhum processo no recorte selecionado."];
  const d: string[] = [
    `${fmtInt(total)} processo(s) no recorte: ${fmtInt(m.demandasAtivas)} ativo(s) (${fmtPct(pct(m.demandasAtivas, total))}) e ${fmtInt(m.demandasEncerradas)} encerrado(s) (${fmtPct(pct(m.demandasEncerradas, total))}).`,
  ];
  if (c) {
    const janela = `de ${rotuloMes(c.inicio)} a ${rotuloMes(c.fim)}`;
    d.push(
      c.variacao === null
        ? `Nos 12 meses completos ${janela} entraram ${fmtInt(c.atual)} processo(s); nos 12 anteriores, nenhum.`
        : `Nos 12 meses completos ${janela} entraram ${fmtInt(c.atual)} processo(s) — ${c.variacao >= 0 ? "alta" : "queda"} de ${fmtPct(Math.abs(c.variacao))} sobre os 12 meses anteriores (${fmtInt(c.anterior)}).`
    );
  }
  if (m.demandasCriticas > 0) {
    d.push(`${fmtInt(m.demandasCriticas)} processo(s) (${fmtPct(pct(m.demandasCriticas, total))}) com prioridade Alta ou Crítica.`);
  }
  if (m.demandasCessarAtos > 0) {
    d.push(`${fmtInt(m.demandasCessarAtos)} processo(s) com "Cessar Atos" no Ponto de Controle.`);
  }
  if (m.totalValorEstimado > 0) {
    d.push(
      `Pagamentos registrados no SIAFI: ${brl(m.totalValorEstimado)} em ${fmtInt(m.demandasComValor)} processo(s) (${fmtPct(pct(m.demandasComValor, total))} do recorte).`
    );
  }
  const top = m.topMedicamentosDistribution.filter((t) => t.medicamento);
  if (top.length) {
    const k = Math.min(5, top.length);
    const soma = top.slice(0, k).reduce((s, t) => s + t.count, 0);
    d.push(
      k > 1
        ? `Os ${k} princípios ativos mais demandados respondem por ${fmtPct(pct(soma, total))} dos processos; o primeiro é ${top[0].medicamento} (${fmtInt(top[0].count)}).`
        : `Princípio ativo mais demandado: ${top[0].medicamento} (${fmtInt(top[0].count)}; ${fmtPct(pct(top[0].count, total))} dos processos).`
    );
  }
  const topValor = m.topMedicamentosValor.find((t) => t.medicamento && t.valor > 0);
  if (topValor) {
    d.push(`Por valor pago (SIAFI), o primeiro princípio ativo é ${topValor.medicamento} (${brl(topValor.valor)}).`);
  }
  const uf = m.ufResidenciaDistribution.find((u) => u.uf);
  if (uf) {
    d.push(`UF de residência com mais processos: ${uf.uf} (${fmtInt(uf.count)}; ${fmtPct(pct(uf.count, total))}).`);
  }
  return d;
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function subtitulo(texto: string): string {
  return `<div style="margin:12px 0 6px;"><strong style="font-size:11px;">${esc(texto)}</strong></div>`;
}

/** Coluna de participação no total — o que o gestor compara primeiro. */
function colunaPct<T>(valor: (r: T) => number, total: number): Coluna<T> {
  return { label: "% do total", fn: (r) => (total > 0 ? fmtPct(pct(valor(r), total)) : "—"), right: true };
}

function tabelaRankingResumida(r: RankingAnual, anos: number[]): string {
  const casas = r.unidade === "reais" ? 2 : 0;
  const valor = (v: number) => (r.unidade === "reais" ? brl(v, casas) : fmtInt(v));
  const colunas: Coluna<LinhaRanking>[] = [
    { label: "Categoria", fn: (l) => esc(rotuloCategoria(r, l.categoria).substring(0, 50)) },
    ...anos.map((ano) => ({
      label: String(ano),
      fn: (l: LinhaRanking) => (l.porAno[ano] ? valor(l.porAno[ano]) : "—"),
      right: true,
    })),
    { label: "Total do período", fn: (l) => `<strong>${valor(l.total)}</strong>`, right: true },
  ];
  return `
    <div style="margin-bottom:14px;page-break-inside:avoid;">
      <div style="border-left:3px solid ${AZUL};background:#eef2f7;padding:4px 8px;font-size:11px;font-weight:bold;color:${AZUL};margin-bottom:6px;">${esc(r.rotulo)}</div>
      ${tabelaSimples(r.linhas.slice(0, TOP_RANKING), colunas)}
    </div>`;
}

export function paginaExecutivoHTML(m: MetricsData, ranking: RankingAnualData | null, ctx: ContextoExport): string {
  const p = calcularPanorama(m);
  const total = m.totalDemandas;
  const c = p.comparacao;
  let n = 0;
  const proxima = () => ++n;

  const corpo: string[] = [
    secao(proxima(), "Recorte e Emissão", tabelaRecorte(m, ctx)),
    secao(
      proxima(),
      "Destaques",
      `<ul style="font-size:11px;line-height:1.6;padding-left:18px;">${p.destaques.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    ),
    secao(
      proxima(),
      "Indicadores-Chave",
      `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        ${cartao("Total de processos", fmtInt(total))}
        ${cartao("Passivo ativo", `${fmtInt(m.demandasAtivas)} · ${fmtPct(pct(m.demandasAtivas, total))}`)}
        ${cartao("Demandas críticas", fmtInt(m.demandasCriticas))}
        ${cartao("Taxa de resolução", fmtPct(m.taxaResolucao))}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${cartao("Valor total (SIAFI)", brl(m.totalValorEstimado))}
        ${cartao("Processos com valor", `${fmtInt(m.demandasComValor)} · ${fmtPct(pct(m.demandasComValor, total))}`)}
        ${cartao("Cessar Atos", fmtInt(m.demandasCessarAtos))}
        ${cartao("Encerrados", fmtInt(m.demandasEncerradas))}
      </div>
      <p style="font-size:10px;color:#444;margin-top:8px;">Entrada no DJUD: ${
        m.primeiraEntrada ? `de ${fmtDate(m.primeiraEntrada)} a ${fmtDate(m.ultimaEntrada ?? m.primeiraEntrada)}` : "sem data de entrada no recorte"
      }. Passivo ativo = não concluídos; críticas = prioridade Alta ou Crítica; Cessar Atos = Ponto de Controle (não é status).</p>`
    ),
    secao(
      proxima(),
      "Evolução",
      `${
        c
          ? `<p style="font-size:11px;margin-bottom:8px;">12 meses completos de <strong>${rotuloMes(c.inicio)} a ${rotuloMes(c.fim)}</strong>: <strong>${fmtInt(c.atual)}</strong> processo(s), contra ${fmtInt(c.anterior)} de ${rotuloMes(c.inicioAnterior)} a ${rotuloMes(c.fimAnterior)}${
              c.variacao === null ? "" : ` (${c.variacao >= 0 ? "+" : "−"}${fmtPct(Math.abs(c.variacao))})`
            }. O mês ${rotuloMes(c.mesExcluido)}, o mais recente da série, fica de fora por poder estar incompleto.</p>`
          : `<p style="font-size:11px;margin-bottom:8px;color:#555;">Sem comparação de 12 meses. ${esc(p.semComparacao ?? "")}</p>`
      }
      ${tabelaSimples(p.anual, [
        { label: "Ano", fn: (l) => String(l.ano) },
        { label: "Processos (data de criação)", fn: (l) => fmtInt(l.processos), right: true },
        { label: "Valor pago no SIAFI (data do pagamento)", fn: (l) => (l.valor ? brl(l.valor) : "—"), right: true },
      ])}
      <p style="font-size:10px;color:#666;margin-top:4px;">${[
        p.ultimoMesProcessos ? `Processos até ${rotuloMes(p.ultimoMesProcessos)}` : null,
        p.ultimoMesValor ? `pagamentos até ${rotuloMes(p.ultimoMesValor)}` : null,
      ]
        .filter(Boolean)
        .join("; ")} — o último ano de cada série é parcial. A série mensal completa está na planilha (CSV).</p>`
    ),
    secao(
      proxima(),
      "Onde se Concentra a Demanda",
      `${subtitulo(`Princípios ativos mais demandados (top ${TOP_LISTA})`)}
      ${tabelaSimples(m.topMedicamentosDistribution.slice(0, TOP_LISTA), [
        { label: "Princípio ativo", fn: (d) => esc(d.medicamento ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}
      ${subtitulo(`Princípios ativos por valor pago no SIAFI (top ${TOP_LISTA})`)}
      ${tabelaSimples(m.topMedicamentosValor.slice(0, TOP_LISTA), [
        { label: "Princípio ativo", fn: (d) => esc(d.medicamento ?? "—") },
        { label: "Valor", fn: (d) => brl(d.valor), right: true },
        colunaPct((d) => d.valor, m.totalValorEstimado),
      ])}
      ${subtitulo("Grupos temáticos")}
      ${tabelaSimples(m.areaTematicaDistribution.slice(0, TOP_LISTA), [
        { label: "Grupo temático", fn: (d) => esc(d.area ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}`
    ),
    secao(
      proxima(),
      "Tramitação e Risco",
      `${subtitulo("Situação no Redmine (ordem do fluxo DJUD)")}
      ${tabelaSimples(m.statusDistribution, [
        { label: "Situação", fn: (d) => esc(d.status) },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}
      ${subtitulo("Prioridade")}
      ${tabelaSimples(m.prioridadeDistribution, [
        { label: "Prioridade", fn: (d) => esc(d.prioridade) },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}`
    ),
    secao(
      proxima(),
      "Distribuição Geográfica",
      `${tabelaSimples(m.regiaoBrasilDistribution, [
        { label: "Região do Brasil", fn: (d) => esc(d.regiao ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}
      ${subtitulo("Tribunal (TRF)")}
      ${tabelaSimples(m.trfRegiaoDistribution, [
        { label: "TRF", fn: (d) => (d.trf ? `${d.trf}ª Região` : "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}
      ${subtitulo(`UF de residência (top ${TOP_LISTA})`)}
      ${tabelaSimples(m.ufResidenciaDistribution.slice(0, TOP_LISTA), [
        { label: "UF", fn: (d) => esc(d.uf ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
        colunaPct((d) => d.count, total),
      ])}`
    ),
  ];

  if (ranking && ranking.anos.length) {
    const anos = ranking.anos.slice(-ANOS_HTML);
    const principais = ranking.rankings.filter(
      (r) => r.linhas.length && ["medicamento", "medicamentoValor", "uf", "trf"].includes(r.dimensao)
    );
    corpo.push(
      secao(
        proxima(),
        "Tendência por Exercício",
        `<p style="font-size:11px;margin-bottom:10px;">As ${TOP_RANKING} maiores categorias do período inteiro, abertas ano a ano (ano de criação)${
          ranking.anos.length > ANOS_HTML ? `, nos últimos ${ANOS_HTML} exercícios` : ""
        }. O ranking por valor usa o valor do depósito registrado na demanda. A planilha traz as 15 categorias e todos os anos dos sete rankings.</p>
        ${principais.map((r) => tabelaRankingResumida(r, anos)).join("")}`
      )
    );
  }

  corpo.push(
    secao(
      proxima(),
      "Notas",
      `<ul style="font-size:10px;line-height:1.6;padding-left:18px;color:#333;">
        <li>Os números são os do Dashboard sob o mesmo recorte: mesma apuração e mesmos filtros, com a lixeira fora das contagens.</li>
        <li>Processos contam pela data de criação no Redmine; valores são os pagamentos registrados no SIAFI (valor da OB), cruzados pelo número do processo e contados pela data do pagamento.</li>
        <li>"Cessar Atos" é registrado no Ponto de Controle, não na situação do Redmine.</li>
      </ul>`
    )
  );

  return documentoHTML({
    titulo: "Panorama Executivo — DJUD",
    subtitulo: "Panorama Executivo — Demandas Judiciais de Medicamentos",
    corpo: corpo.join("\n"),
    ctx,
  });
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export function csvExecutivo(m: MetricsData, ranking: RankingAnualData | null, ctx: ContextoExport): string {
  const p = calcularPanorama(m);
  const total = m.totalDemandas;
  const c = p.comparacao;
  const comPct = <T>(rows: T[], rotulo: (r: T) => unknown, valor: (r: T) => number, base: number, casas = 0) =>
    rows.map((r) => [rotulo(r), num(valor(r), casas), base > 0 ? num(pct(valor(r), base), 1) : ""]);

  const blocos: BlocoCsv[] = [
    {
      titulo: "Indicadores-chave",
      cabecalho: ["Indicador", "Valor"],
      linhas: [
        ["Total de processos", total],
        ["Passivo ativo (não concluídos)", m.demandasAtivas],
        ["Encerrados", m.demandasEncerradas],
        ["Demandas críticas (Alta + Crítica)", m.demandasCriticas],
        ["Taxa de resolução (%)", num(m.taxaResolucao, 2)],
        ["Cessar Atos (Ponto de Controle)", m.demandasCessarAtos],
        ["Valor total pago — SIAFI (R$)", num(m.totalValorEstimado, 2)],
        ["Processos com pagamento no SIAFI", m.demandasComValor],
        ["Primeira entrada no DJUD", m.primeiraEntrada ? fmtDate(m.primeiraEntrada) : ""],
        ["Última entrada no DJUD", m.ultimaEntrada ? fmtDate(m.ultimaEntrada) : ""],
      ],
    },
    { titulo: "Destaques", cabecalho: ["Destaque"], linhas: p.destaques.map((t) => [t]) },
    {
      titulo: "Últimos 12 meses completos × 12 anteriores (processos, data de criação)",
      cabecalho: ["Janela", "De", "Até", "Processos"],
      linhas: c
        ? [
            ["Últimos 12 meses completos", rotuloMes(c.inicio), rotuloMes(c.fim), c.atual],
            ["12 meses anteriores", rotuloMes(c.inicioAnterior), rotuloMes(c.fimAnterior), c.anterior],
            ["Variação (%)", "", "", c.variacao === null ? "" : num(c.variacao, 1)],
            [`Fora da comparação: ${rotuloMes(c.mesExcluido)} (mês mais recente, pode estar incompleto)`, "", "", ""],
          ]
        : [[`Sem comparação. ${p.semComparacao ?? ""}`, "", "", ""]],
    },
    {
      titulo: "Série anual",
      cabecalho: ["Ano", "Processos (data de criação)", "Valor pago no SIAFI (R$, data do pagamento)"],
      linhas: p.anual.map((l) => [l.ano, l.processos, num(l.valor, 2)]),
    },
    {
      titulo: "Série mensal — processos",
      cabecalho: ["Mês", "Processos"],
      linhas: m.demandasTimeline.map((d) => [rotuloMes(chaveMes(d.date)), d.count]),
    },
    {
      titulo: "Série mensal — valor pago no SIAFI (R$)",
      cabecalho: ["Mês", "Valor (R$)"],
      linhas: m.valorTimeline.map((d) => [rotuloMes(chaveMes(d.mes)), num(d.valor, 2)]),
    },
    {
      titulo: "Princípios ativos mais demandados",
      cabecalho: ["Princípio ativo", "Processos", "% do total"],
      linhas: comPct(m.topMedicamentosDistribution, (d) => d.medicamento ?? "—", (d) => d.count, total),
    },
    {
      titulo: "Princípios ativos por valor pago no SIAFI",
      cabecalho: ["Princípio ativo", "Valor (R$)", "% do total"],
      linhas: comPct(m.topMedicamentosValor, (d) => d.medicamento ?? "—", (d) => d.valor, m.totalValorEstimado, 2),
    },
    {
      titulo: "Grupo temático",
      cabecalho: ["Grupo temático", "Processos", "% do total"],
      linhas: comPct(m.areaTematicaDistribution, (d) => d.area ?? "—", (d) => d.count, total),
    },
    {
      titulo: "Situação no Redmine",
      cabecalho: ["Situação", "Processos", "% do total"],
      linhas: comPct(m.statusDistribution, (d) => d.status, (d) => d.count, total),
    },
    {
      titulo: "Prioridade",
      cabecalho: ["Prioridade", "Processos", "% do total"],
      linhas: comPct(m.prioridadeDistribution, (d) => d.prioridade, (d) => d.count, total),
    },
    {
      titulo: "Região do Brasil",
      cabecalho: ["Região", "Processos", "% do total"],
      linhas: comPct(m.regiaoBrasilDistribution, (d) => d.regiao ?? "—", (d) => d.count, total),
    },
    {
      titulo: "TRF",
      cabecalho: ["TRF", "Processos", "% do total"],
      linhas: comPct(m.trfRegiaoDistribution, (d) => (d.trf ? `${d.trf}ª Região` : "—"), (d) => d.count, total),
    },
    {
      titulo: "UF de residência",
      cabecalho: ["UF", "Processos", "% do total"],
      linhas: comPct(m.ufResidenciaDistribution, (d) => d.uf ?? "—", (d) => d.count, total),
    },
    ...(ranking ? blocosRankingAnual(ranking) : []),
  ];

  return csvDeBlocos("Panorama Executivo DJUD — Ministério da Saúde", m, ctx, blocos);
}
