import {
  AZUL,
  esc,
  fmtDate,
  fmtDateLong,
  fmtInt,
  secao,
  tabela,
  type Coluna,
} from "@/lib/relatorio-pesquisa-preco";
import type { MetricsData } from "@/lib/metrics";
import type { LinhaRanking, RankingAnualData } from "@/lib/metrics-ranking-anual";

// ─────────────────────────────────────────────────────────────────────────────
// Exportação do painel analítico — planilha (CSV) e relatório (HTML imprimível)
// com os mesmos números que estão na tela, sob os mesmos filtros.
//
// CSV e não XLSX de propósito: o Excel abre CSV nativamente, o arquivo é
// auditável em qualquer editor de texto e não depende de biblioteca binária
// nova no bundle. Em compensação exige três cuidados para o Excel pt-BR não
// estragar o arquivo — separador ";", decimal com vírgula e BOM UTF-8 (ver
// `csvDoPainel`).
//
// A planilha é multi-bloco: cada indicador vira uma seção com o próprio
// cabeçalho, em vez de uma tabela larga com colunas heterogêneas. Quem vai
// usar isso em instrução processual copia o bloco que interessa.
// ─────────────────────────────────────────────────────────────────────────────

/** Par rótulo/valor descrevendo o recorte aplicado — vai no topo dos dois formatos. */
export type FiltroDescrito = [rotulo: string, valor: string];

export interface ContextoExport {
  geradoEm: Date;
  filtros: FiltroDescrito[];
  /** Nome de quem exportou, para o rodapé do relatório. */
  responsavel: string;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Número no padrão pt-BR (vírgula decimal) — o Excel local espera assim. */
function num(v: number | null | undefined, dec = 0): string {
  if (v == null || !Number.isFinite(v)) return "";
  return v.toFixed(dec).replace(".", ",");
}

/**
 * Campo de CSV com separador ";". Aspas duplicadas, e o campo é sempre
 * envolvido: descrições de demanda trazem ";" e quebras de linha à vontade.
 */
function campo(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function linha(...valores: unknown[]): string {
  return valores.map(campo).join(";");
}

interface BlocoCsv {
  titulo: string;
  cabecalho: string[];
  linhas: unknown[][];
}

function blocosDoPainel(m: MetricsData, ranking: RankingAnualData | null): BlocoCsv[] {
  const blocos: BlocoCsv[] = [
    {
      titulo: "Indicadores principais",
      cabecalho: ["Indicador", "Valor"],
      linhas: [
        ["Total de processos", m.totalDemandas],
        ["Passivo ativo (não concluídos)", m.demandasAtivas],
        ["Demandas críticas (Alta + Crítica)", m.demandasCriticas],
        ["Taxa de resolução (%)", num(m.taxaResolucao, 2)],
        ["Valor estimado total (R$)", num(m.totalValorEstimado, 2)],
      ],
    },
    {
      titulo: "Série histórica mensal — processos",
      cabecalho: ["Mês", "Processos"],
      linhas: m.demandasTimeline.map((d) => [fmtDate(d.date), d.count]),
    },
    {
      titulo: "Série histórica mensal — valor (R$)",
      cabecalho: ["Mês", "Valor (R$)"],
      linhas: m.valorTimeline.map((d) => [fmtDate(d.mes), num(d.valor, 2)]),
    },
    {
      titulo: "Série mensal por tribunal — processos",
      cabecalho: ["Mês", "TRF", "Processos"],
      linhas: m.tribunalTimeline.map((d) => [fmtDate(d.mes), d.trf ?? "—", d.count]),
    },
    {
      titulo: "Série mensal por tribunal — valor (R$)",
      cabecalho: ["Mês", "TRF", "Valor (R$)"],
      linhas: m.valorTribunalTimeline.map((d) => [fmtDate(d.mes), d.trf ?? "—", num(d.valor, 2)]),
    },
    {
      titulo: "Top princípios ativos — por nº de processos",
      cabecalho: ["Princípio ativo", "Processos"],
      linhas: m.topMedicamentosDistribution.map((d) => [d.medicamento ?? "—", d.count]),
    },
    {
      titulo: "Top princípios ativos — por valor (R$)",
      cabecalho: ["Princípio ativo", "Valor (R$)"],
      linhas: m.topMedicamentosValor.map((d) => [d.medicamento ?? "—", num(d.valor, 2)]),
    },
    {
      titulo: "Grupo temático",
      cabecalho: ["Grupo temático", "Processos"],
      linhas: m.areaTematicaDistribution.map((d) => [d.area ?? "—", d.count]),
    },
    {
      titulo: "Objeto da ação",
      cabecalho: ["Objeto da ação", "Processos"],
      linhas: m.objetoAcaoDistribution.map((d) => [d.objeto ?? "—", d.count]),
    },
    {
      titulo: "Fornecedor do medicamento",
      cabecalho: ["Fornecedor", "Processos"],
      linhas: m.fornecedorDistribution.map((d) => [d.fornecedor ?? "—", d.count]),
    },
    {
      titulo: "Status (funil de tramitação)",
      cabecalho: ["Status", "Processos"],
      linhas: m.statusDistribution.map((d) => [d.status, d.count]),
    },
    {
      titulo: "Prioridade",
      cabecalho: ["Prioridade", "Processos"],
      linhas: m.prioridadeDistribution.map((d) => [d.prioridade, d.count]),
    },
    {
      titulo: "Região do Brasil",
      cabecalho: ["Região", "Processos"],
      linhas: m.regiaoBrasilDistribution.map((d) => [d.regiao ?? "—", d.count]),
    },
    {
      titulo: "TRF Região",
      cabecalho: ["TRF", "Processos"],
      linhas: m.trfRegiaoDistribution.map((d) => [d.trf ?? "—", d.count]),
    },
    {
      titulo: "UF de residência",
      cabecalho: ["UF", "Processos"],
      linhas: m.ufResidenciaDistribution.map((d) => [d.uf ?? "—", d.count]),
    },
    {
      titulo: "Forma de cumprimento",
      cabecalho: ["Forma", "Processos"],
      linhas: m.formaCumprimentoDistribution.map((d) => [d.forma ?? "—", d.count]),
    },
    {
      titulo: "Área finalística MS",
      cabecalho: ["Área", "Processos"],
      linhas: m.areaFinalisticaDistribution.map((d) => [d.area ?? "—", d.count]),
    },
    {
      titulo: "Responsáveis com maior volume",
      cabecalho: ["Responsável", "Processos"],
      linhas: m.topResponsaveis.map((d) => [d.name ?? "(sem nome)", d.count]),
    },
  ];

  if (ranking) {
    for (const r of ranking.rankings) {
      if (!r.linhas.length) continue;
      const casas = r.unidade === "reais" ? 2 : 0;
      blocos.push({
        titulo: `Ranking por ano — ${r.rotulo}`,
        cabecalho: [
          "Categoria",
          ...ranking.anos.map(String),
          "Total do período",
          "Variação 1º→último ano (%)",
        ],
        linhas: r.linhas.map((l) => [
          l.categoria,
          ...ranking.anos.map((a) => num(l.porAno[a] ?? 0, casas)),
          num(l.total, casas),
          l.variacao === null ? "" : num(l.variacao, 1),
        ]),
      });
    }
  }

  return blocos;
}

export function csvDoPainel(
  m: MetricsData,
  ranking: RankingAnualData | null,
  ctx: ContextoExport
): string {
  const partes: string[] = [
    linha("Painel de Inteligência DJUD — Ministério da Saúde"),
    linha("Departamento de Judicialização — demandas judiciais de medicamentos"),
    linha("Gerado em", fmtDateLong(ctx.geradoEm)),
    linha("Exportado por", ctx.responsavel || "—"),
    "",
    linha("FILTROS APLICADOS"),
    ...(ctx.filtros.length
      ? ctx.filtros.map(([r, v]) => linha(r, v))
      : [linha("Nenhum", "todo o período e toda a base")]),
  ];

  if (m.filtroCatmat && !m.filtroCatmat.encontrado) {
    partes.push("", linha("AVISO", m.filtroCatmat.motivo ?? "Código não encontrado"));
  }

  for (const bloco of blocosDoPainel(m, ranking)) {
    partes.push("", linha(bloco.titulo.toUpperCase()), bloco.cabecalho.map(campo).join(";"));
    if (!bloco.linhas.length) {
      partes.push(linha("(sem dados no recorte selecionado)"));
      continue;
    }
    for (const l of bloco.linhas) partes.push(l.map(campo).join(";"));
  }

  // BOM: sem ele o Excel pt-BR lê UTF-8 como ANSI e "Judicialização" chega
  // como "JudicializaÃ§Ã£o".
  return `﻿${partes.join("\r\n")}\r\n`;
}

// ── Relatório HTML imprimível ────────────────────────────────────────────────

function tabelaSimples<T>(rows: T[], colunas: Coluna<T>[]): string {
  if (!rows.length) {
    return `<p style="color:#666;font-size:11px;font-style:italic;">Sem dados no recorte selecionado.</p>`;
  }
  return tabela(rows, colunas);
}

const brl = (v: number, dec = 2) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

function cartao(label: string, valor: string): string {
  return `<div style="flex:1;min-width:130px;border:1px solid ${AZUL};border-radius:4px;padding:10px;text-align:center;background:#eef2f7;">
      <div style="font-size:9px;color:#555;text-transform:uppercase;margin-bottom:4px;">${label}</div>
      <div style="font-size:17px;font-weight:bold;color:${AZUL};">${valor}</div>
    </div>`;
}

function secaoRankingAnual(ranking: RankingAnualData): string {
  if (!ranking.anos.length) {
    return `<p style="font-size:11px;color:#666;font-style:italic;">Não há anos suficientes no recorte selecionado para a comparação.</p>`;
  }
  return `
    <p style="font-size:11px;margin-bottom:10px;">Cada ranking abaixo mantém as ${ranking.rankings[0]?.linhas.length ?? 0} maiores categorias do período inteiro e mostra a distribuição por ano, permitindo distinguir o que cresce do que já vinha grande. A coluna de variação compara o primeiro e o último ano com ocorrência da própria categoria.</p>
    ${ranking.rankings
      .filter((r) => r.linhas.length > 0)
      .map((r) => {
        const casas = r.unidade === "reais" ? 2 : 0;
        const valor = (v: number) => (r.unidade === "reais" ? brl(v, casas) : fmtInt(v));
        const colunas: Coluna<LinhaRanking>[] = [
          { label: "Categoria", fn: (l) => esc(l.categoria.substring(0, 60)) },
          ...ranking.anos.map((ano) => ({
            label: String(ano),
            fn: (l: LinhaRanking) => (l.porAno[ano] ? valor(l.porAno[ano]) : "—"),
            right: true,
          })),
          { label: "Total", fn: (l) => `<strong>${valor(l.total)}</strong>`, right: true },
          {
            label: "Variação",
            fn: (l) =>
              l.variacao === null
                ? "—"
                : `<span style="color:${l.variacao >= 0 ? "#166534" : "#c0392b"};">${
                    l.variacao >= 0 ? "+" : ""
                  }${l.variacao.toFixed(1)}%</span>`,
            right: true,
          },
        ];
        return `
        <div style="margin-bottom:16px;page-break-inside:avoid;">
          <div style="border-left:3px solid ${AZUL};background:#eef2f7;padding:4px 8px;font-size:11px;font-weight:bold;color:${AZUL};margin-bottom:6px;">
            ${esc(r.rotulo)}
          </div>
          ${tabelaSimples(r.linhas, colunas)}
        </div>`;
      })
      .join("")}`;
}

export function paginaPainelHTML(
  m: MetricsData,
  ranking: RankingAnualData | null,
  ctx: ContextoExport
): string {
  const corpo = [
    secao(
      1,
      "Recorte da Análise",
      `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr><td style="border:1px solid #ccc;padding:4px 8px;width:32%;background:#f5f5f5;font-weight:bold;">Data de emissão</td><td style="border:1px solid #ccc;padding:4px 8px;">${fmtDateLong(ctx.geradoEm)}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Exportado por</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(ctx.responsavel) || "—"}</td></tr>
        ${
          ctx.filtros.length
            ? ctx.filtros
                .map(
                  ([r, v]) =>
                    `<tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">${esc(r)}</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(v)}</td></tr>`
                )
                .join("")
            : `<tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Filtros</td><td style="border:1px solid #ccc;padding:4px 8px;">Nenhum — todo o período e toda a base</td></tr>`
        }
      </table>
      ${
        m.filtroCatmat?.encontrado
          ? `<p style="font-size:10px;color:#444;margin-top:6px;">O filtro por código não incide sobre uma coluna CATMAT da demanda — a base do Redmine não a possui. Ele traduz o código para a(s) substância(s) do catálogo e procura por elas no princípio ativo, no título e na descrição da demanda: ${esc(m.filtroCatmat.grupos.map((g) => g.rotulo).join(" · "))}.</p>`
          : ""
      }`
    ),
    secao(
      2,
      "Indicadores Principais",
      `<div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${cartao("Total de processos", fmtInt(m.totalDemandas))}
        ${cartao("Passivo ativo", fmtInt(m.demandasAtivas))}
        ${cartao("Demandas críticas", fmtInt(m.demandasCriticas))}
        ${cartao("Taxa de resolução", `${m.taxaResolucao.toFixed(1)}%`)}
        ${cartao("Valor estimado total", brl(m.totalValorEstimado))}
      </div>`
    ),
    secao(
      3,
      "Dimensionamento da Demanda",
      `<div style="margin-bottom:12px;"><strong style="font-size:11px;">Princípios ativos mais demandados (nº de processos)</strong></div>
      ${tabelaSimples(m.topMedicamentosDistribution, [
        { label: "Princípio ativo", fn: (d) => esc(d.medicamento ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}
      <div style="margin:12px 0;"><strong style="font-size:11px;">Princípios ativos por valor total</strong></div>
      ${tabelaSimples(m.topMedicamentosValor, [
        { label: "Princípio ativo", fn: (d) => esc(d.medicamento ?? "—") },
        { label: "Valor", fn: (d) => brl(d.valor), right: true },
      ])}
      <div style="margin:12px 0;"><strong style="font-size:11px;">Grupo temático e objeto da ação</strong></div>
      ${tabelaSimples(m.areaTematicaDistribution, [
        { label: "Grupo temático", fn: (d) => esc(d.area ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}`
    ),
    secao(
      4,
      "Distribuição Geográfica e por Tribunal",
      `${tabelaSimples(m.regiaoBrasilDistribution, [
        { label: "Região do Brasil", fn: (d) => esc(d.regiao ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}
      <div style="margin:12px 0;"><strong style="font-size:11px;">Por TRF e por UF de residência</strong></div>
      ${tabelaSimples(m.trfRegiaoDistribution, [
        { label: "TRF Região", fn: (d) => (d.trf ? `${d.trf}ª Região` : "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}
      <div style="height:8px;"></div>
      ${tabelaSimples(m.ufResidenciaDistribution, [
        { label: "UF", fn: (d) => esc(d.uf ?? "—") },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}`
    ),
    secao(
      5,
      "Tramitação e Risco",
      `${tabelaSimples(m.statusDistribution, [
        { label: "Status (ordem do fluxo DJUD)", fn: (d) => esc(d.status) },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}
      <div style="margin:12px 0;"><strong style="font-size:11px;">Perfil de risco</strong></div>
      ${tabelaSimples(m.prioridadeDistribution, [
        { label: "Prioridade", fn: (d) => esc(d.prioridade) },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}`
    ),
    secao(
      6,
      "Série Histórica Mensal",
      `${tabelaSimples(m.demandasTimeline.slice(-36), [
        { label: "Mês", fn: (d) => fmtDate(d.date) },
        { label: "Processos", fn: (d) => fmtInt(d.count), right: true },
      ])}
      <p style="font-size:10px;color:#666;margin-top:4px;">Últimos 36 meses do recorte. A série completa está na planilha (CSV).</p>`
    ),
  ];

  if (ranking) {
    corpo.push(secao(7, "Rankings em Série Anual — Comparação entre Exercícios", secaoRankingAnual(ranking)));
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Painel DJUD — Relatório Analítico</title>
  <style>
    @page { size: A4; margin: 18mm 15mm 20mm 20mm; }
    @media print { .no-print { display: none !important; } body { background: white !important; } .section { page-break-inside: avoid; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11px; color: #111; background: #f0f0f0; }
    .page { background: white; max-width: 860px; margin: 20px auto; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
    .header { border-bottom: 3px solid ${AZUL}; padding-bottom: 10px; margin-bottom: 16px; }
    .header h1 { font-size: 14px; color: ${AZUL}; text-transform: uppercase; letter-spacing: .3px; }
    .header h2 { font-size: 11px; font-weight: normal; color: #444; margin-top: 3px; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: ${AZUL}; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    footer { border-top: 1px solid #ccc; margin-top: 20px; padding-top: 6px; font-size: 9px; color: #777; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">⊕ Imprimir / Salvar PDF</button>
  <div class="page">
    <div class="header">
      <h1>Ministério da Saúde — Departamento de Judicialização</h1>
      <h2>Relatório Analítico do Painel de Demandas Judiciais de Medicamentos</h2>
    </div>
    ${corpo.join("\n")}
    <footer>
      <span>Gerado pelo DJUD Painel · ${fmtDate(ctx.geradoEm)}</span>
      <span>Os números refletem os filtros declarados na seção 1</span>
    </footer>
  </div>
</body>
</html>`;
}
