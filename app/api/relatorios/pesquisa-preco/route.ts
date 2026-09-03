export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function limparOutliers(valores: number[]): { limpo: number[]; removidos: number } {
  if (valores.length < 4) return { limpo: valores, removidos: 0 };
  const sorted = [...valores].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const limpo = sorted.filter((v) => v >= lo && v <= hi);
  return { limpo, removidos: sorted.length - limpo.length };
}

function fmtBRL(v: number | null, dec = 4): string {
  if (v == null) return "—";
  const [int, d] = v.toFixed(dec).split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${d}`;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtDateLong(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

// ── HTML Generator ────────────────────────────────────────────────────────────

function gerarHTML(data: {
  termo: string;
  orgao: string;
  responsavel: string;
  cargo: string;
  processo: string;
  especificacao: string;
  unidade: string;
  cmed: { total: number; pmvgMin: number | null; pmvgMax: number | null; registros: any[] };
  bps: { total: number; amostra: number; precoMin: number | null; precoMax: number | null; mediana: number | null; removidos: number; registros: any[] };
  siasg: { total: number; amostra: number; precoMin: number | null; precoMax: number | null; mediana: number | null; removidos: number; registros: any[] };
  pncp: { total: number; amostra: number; precoMin: number | null; precoMax: number | null; mediana: number | null; removidos: number; registros: any[] };
  precoRef: number | null;
  precoFinal: number | null;
  pmvgAplicado: boolean;
  capAplica: boolean;
  fontes: string[];
  observacoes: string[];
  geradoEm: Date;
}): string {
  const validadeAte = new Date(data.geradoEm);
  validadeAte.setDate(validadeAte.getDate() + 90);

  const secao = (num: number, titulo: string, conteudo: string) => `
    <div class="section" style="margin-bottom:24px; page-break-inside:avoid;">
      <div class="section-header" style="background:#1a3a5c; color:#fff; padding:6px 12px; font-size:12px; font-weight:bold; margin-bottom:8px;">
        ${num}. ${titulo.toUpperCase()}
      </div>
      <div style="padding:0 4px;">${conteudo}</div>
    </div>`;

  const tabelaRegistros = (rows: any[], colunas: { label: string; fn: (r: any) => string }[]) => {
    if (!rows.length) return `<p style="color:#666;font-size:11px;font-style:italic;">Nenhum registro na amostra.</p>`;
    return `
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="background:#e8edf2;">
            ${colunas.map(c => `<th style="border:1px solid #ccc;padding:4px 6px;text-align:left;">${c.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
              ${colunas.map(c => `<td style="border:1px solid #ccc;padding:4px 6px;">${c.fn(r)}</td>`).join("")}
            </tr>`).join("")}
        </tbody>
      </table>`;
  };

  const estatBox = (label: string, valor: string, destaque = false) =>
    `<div style="flex:1;min-width:100px;border:1px solid ${destaque ? "#1a3a5c" : "#ddd"};padding:8px;text-align:center;border-radius:4px;background:${destaque ? "#eef2f7" : "#fff"}">
      <div style="font-size:9px;color:#666;margin-bottom:4px;">${label}</div>
      <div style="font-size:${destaque ? "14px" : "12px"};font-weight:bold;color:${destaque ? "#1a3a5c" : "#333"};">${valor}</div>
    </div>`;

  // Seção 5 — CMED
  const cmedContent = data.cmed.total === 0
    ? `<p style="color:#c0392b;font-style:italic;font-size:11px;">Substância não encontrada na tabela CMED vigente. Não há preço-teto regulado pela ANVISA para este item.</p>`
    : `
      <p style="font-size:11px;margin-bottom:8px;">Foram encontrados <strong>${data.cmed.total}</strong> produto(s) correspondente(s) na tabela CMED vigente (Câmara de Regulação do Mercado de Medicamentos — ANVISA).</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("PMVG mínimo (sem impostos)", fmtBRL(data.cmed.pmvgMin))}
        ${estatBox("PMVG máximo (sem impostos)", fmtBRL(data.cmed.pmvgMax))}
        ${data.capAplica ? estatBox("Desconto CAP obrigatório", "21,53% sobre PF", true) : ""}
      </div>
      ${tabelaRegistros(data.cmed.registros.slice(0, 8), [
        { label: "Substância", fn: r => r.substancia },
        { label: "Produto / Apresentação", fn: r => `${r.produto || "—"} / ${r.apresentacao || "—"}` },
        { label: "Laboratório", fn: r => r.laboratorio || "—" },
        { label: "PMVG s/ imp.", fn: r => fmtBRL(r.pmvgSemImpostos) },
        { label: "PF 0%", fn: r => fmtBRL(r.pf0) },
        { label: "CAP", fn: r => r.cap ? "Sim" : "Não" },
      ])}`;

  // Seção 6 — BPS
  const bpsContent = data.bps.total === 0
    ? `<p style="color:#666;font-style:italic;font-size:11px;">Nenhum registro encontrado no BPS para este item.</p>`
    : `
      <p style="font-size:11px;margin-bottom:8px;">Foram identificados <strong>${data.bps.total.toLocaleString("pt-BR")}</strong> registros no BPS (anos 2020–2024). Analisada amostra de <strong>${data.bps.amostra}</strong> registros mais recentes. ${data.bps.removidos > 0 ? `Removidos <strong>${data.bps.removidos}</strong> outliers pelo método IQR.` : "Nenhum outlier identificado."}</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("Mínimo (pós-limpeza)", fmtBRL(data.bps.precoMin))}
        ${estatBox("Mediana", fmtBRL(data.bps.mediana), true)}
        ${estatBox("Máximo (pós-limpeza)", fmtBRL(data.bps.precoMax))}
        ${estatBox("Registros na amostra", String(data.bps.amostra))}
      </div>
      ${tabelaRegistros(data.bps.registros, [
        { label: "Descrição", fn: r => (r.descricao || "").substring(0, 60) },
        { label: "Preço", fn: r => fmtBRL(r.preco) },
        { label: "Unidade", fn: r => r.unidade || "—" },
        { label: "Data", fn: r => r.data ? fmtDate(r.data) : "—" },
        { label: "UF", fn: r => r.uf || "—" },
        { label: "Instituição", fn: r => (r.instituicao || "—").substring(0, 40) },
      ])}`;

  // Seção 7 — SIASG
  const siasgContent = data.siasg.total === 0
    ? `<p style="color:#666;font-style:italic;font-size:11px;">Nenhum registro encontrado no SIASG para compras judiciais deste item.</p>`
    : `
      <p style="font-size:11px;margin-bottom:8px;">Foram identificados <strong>${data.siasg.total.toLocaleString("pt-BR")}</strong> registros de compras com ação judicial no SIASG (2000–2021). Analisada amostra de <strong>${data.siasg.amostra}</strong> registros mais recentes. ${data.siasg.removidos > 0 ? `Removidos <strong>${data.siasg.removidos}</strong> outliers pelo método IQR.` : "Nenhum outlier identificado."}</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("Mínimo (pós-limpeza)", fmtBRL(data.siasg.precoMin))}
        ${estatBox("Mediana", fmtBRL(data.siasg.mediana), true)}
        ${estatBox("Máximo (pós-limpeza)", fmtBRL(data.siasg.precoMax))}
        ${estatBox("Registros na amostra", String(data.siasg.amostra))}
      </div>
      ${tabelaRegistros(data.siasg.registros, [
        { label: "Descrição", fn: r => (r.descricao || "").substring(0, 60) },
        { label: "Preço", fn: r => fmtBRL(r.preco) },
        { label: "Unidade", fn: r => r.unidade || "—" },
        { label: "Data", fn: r => r.data ? fmtDate(r.data) : "—" },
        { label: "UF", fn: r => r.uf || "—" },
        { label: "Órgão", fn: r => (r.orgao || "—").substring(0, 40) },
      ])}`;

  // Seção 8 — PNCP
  const pncpContent = data.pncp.total === 0
    ? `<p style="color:#666;font-style:italic;font-size:11px;">Nenhum registro encontrado no PNCP para este item.</p>`
    : `
      <p style="font-size:11px;margin-bottom:8px;">Foram identificados <strong>${data.pncp.total.toLocaleString("pt-BR")}</strong> registros no PNCP (materiais, 2024–2025). Analisada amostra de <strong>${data.pncp.amostra}</strong> registros mais recentes. ${data.pncp.removidos > 0 ? `Removidos <strong>${data.pncp.removidos}</strong> outliers pelo método IQR.` : "Nenhum outlier identificado."}</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("Mínimo (pós-limpeza)", fmtBRL(data.pncp.precoMin))}
        ${estatBox("Mediana", fmtBRL(data.pncp.mediana), true)}
        ${estatBox("Máximo (pós-limpeza)", fmtBRL(data.pncp.precoMax))}
        ${estatBox("Registros na amostra", String(data.pncp.amostra))}
      </div>
      ${tabelaRegistros(data.pncp.registros, [
        { label: "Descrição", fn: r => (r.descricaoResumida || "").substring(0, 60) },
        { label: "Preço", fn: r => fmtBRL(r.valorUnitResultado) },
        { label: "Unidade", fn: r => r.unidade || "—" },
        { label: "Data", fn: r => r.data ? fmtDate(r.data) : "—" },
        { label: "UF", fn: r => r.uf || "—" },
        { label: "Fornecedor", fn: r => (r.fornecedor || "—").substring(0, 40) },
      ])}`;

  // Seção 9 — Análise
  const fonteLinhas = [
    { fonte: "BPS", mediana: data.bps.mediana, n: data.bps.amostra, removidos: data.bps.removidos },
    { fonte: "SIASG (judicial)", mediana: data.siasg.mediana, n: data.siasg.amostra, removidos: data.siasg.removidos },
    { fonte: "PNCP", mediana: data.pncp.mediana, n: data.pncp.amostra, removidos: data.pncp.removidos },
  ].filter(f => f.mediana !== null);

  const analiseContent = `
    <p style="font-size:11px;margin-bottom:10px;">A metodologia adotada segue o disposto no art. 5º da IN SEGES/ME nº 65/2021: coleta de preços em fontes oficiais, remoção de valores inexequíveis ou excessivos pelo método do intervalo interquartil (IQR: valores fora de Q1−1,5×IQR ou Q3+1,5×IQR são descartados) e cálculo da mediana como preço estimado.</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;">
      <thead>
        <tr style="background:#e8edf2;">
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:left;">Fonte</th>
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:right;">Registros analisados</th>
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:right;">Outliers removidos</th>
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:right;">Mediana apurada</th>
        </tr>
      </thead>
      <tbody>
        ${fonteLinhas.map((f, i) => `
          <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
            <td style="border:1px solid #ccc;padding:5px 8px;">${f.fonte}</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${f.n}</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${f.removidos}</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:bold;">${fmtBRL(f.mediana)}</td>
          </tr>`).join("")}
        <tr style="background:#eef2f7;font-weight:bold;">
          <td style="border:1px solid #ccc;padding:5px 8px;" colspan="3">Preço de referência (mediana das medianas por fonte)</td>
          <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;color:#1a3a5c;font-size:13px;">${fmtBRL(data.precoRef)}</td>
        </tr>
        ${data.pmvgAplicado ? `
        <tr style="background:#fef3cd;">
          <td style="border:1px solid #ccc;padding:5px 8px;" colspan="3">⚠ Preço de mercado superior ao PMVG — aplicado PMVG sem impostos como teto (art. 3º, §2º, Lei nº 10.742/2003)</td>
          <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:bold;color:#c0392b;">${fmtBRL(data.cmed.pmvgMin)}</td>
        </tr>` : ""}
      </tbody>
    </table>
    ${fonteLinhas.length < 3 ? `<p style="font-size:10px;color:#c0392b;"><strong>Atenção:</strong> Apenas ${fonteLinhas.length} fonte(s) com dados disponíveis. O art. 5º, §3º da IN 65/2021 recomenda consulta a no mínimo 3 fontes. Recomenda-se complementar a pesquisa com cotação direta a fornecedores.</p>` : ""}`;

  // Seção 10 — Conclusão
  const conclusaoContent = `
    <div style="border:2px solid #1a3a5c;padding:12px;margin-bottom:16px;border-radius:4px;background:#eef2f7;">
      <p style="font-size:13px;font-weight:bold;color:#1a3a5c;margin-bottom:6px;">PREÇO UNITÁRIO ESTIMADO:</p>
      <p style="font-size:22px;font-weight:bold;color:#1a3a5c;">${fmtBRL(data.precoFinal)}<span style="font-size:12px;font-weight:normal;color:#555;margin-left:8px;">por ${data.unidade || "unidade"}</span></p>
      ${data.pmvgAplicado ? `<p style="font-size:10px;color:#c0392b;margin-top:4px;">* Teto PMVG aplicado — preço de mercado estava acima do limite regulatório ANVISA/CMED</p>` : ""}
      ${data.capAplica ? `<p style="font-size:10px;color:#c0392b;margin-top:2px;">* Produto sujeito a desconto CAP de 21,53% sobre o PF nas aquisições não judiciais</p>` : ""}
    </div>
    ${data.observacoes.length > 0 ? `
    <div style="margin-bottom:14px;">
      <strong style="font-size:11px;">Observações:</strong>
      <ul style="margin-top:4px;padding-left:18px;">
        ${data.observacoes.map(o => `<li style="font-size:10px;margin-bottom:3px;">${o}</li>`).join("")}
      </ul>
    </div>` : ""}
    <p style="font-size:11px;margin-bottom:6px;"><strong>Validade desta pesquisa:</strong> 90 (noventa) dias, conforme art. 5º, §4º da IN SEGES/ME nº 65/2021 — até <strong>${fmtDateLong(validadeAte)}</strong>.</p>
    <p style="font-size:11px;margin-bottom:16px;"><strong>Bases consultadas:</strong> CMED/ANVISA (tabela vigente), BPS 2020–2024, SIASG/Comprasnet (compras judiciais 2000–2021), PNCP (materiais 2024–2025).</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;">
      <tr>
        <td style="width:50%;padding-right:20px;">
          <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px;">
            <strong>${data.responsavel || "_".repeat(40)}</strong><br/>
            <span style="font-size:10px;color:#555;">${data.cargo || "Cargo / Matrícula"}</span><br/>
            <span style="font-size:10px;color:#555;">${data.orgao || "Órgão"}</span>
          </div>
        </td>
        <td style="width:50%;padding-left:20px;">
          <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px;">
            <strong style="color:#aaa;">_".repeat(40)"</strong><br/>
            <span style="font-size:10px;color:#555;">Autoridade Competente</span><br/>
            <span style="font-size:10px;color:#555;">Data: ____/____/________</span>
          </div>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Pesquisa de Preços — ${data.termo.toUpperCase()}</title>
  <style>
    @page { size: A4; margin: 18mm 15mm 20mm 20mm; }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
      .section { page-break-inside: avoid; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11px; color: #111; background: #f0f0f0; }
    .page { background: white; max-width: 800px; margin: 20px auto; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
    .header-top { display: flex; align-items: flex-start; gap: 16px; border-bottom: 3px solid #1a3a5c; padding-bottom: 10px; margin-bottom: 14px; }
    .header-brasao { width: 56px; flex-shrink: 0; text-align: center; font-size: 9px; color: #555; }
    .header-text h1 { font-size: 13px; font-weight: bold; color: #1a3a5c; text-transform: uppercase; letter-spacing: .3px; }
    .header-text h2 { font-size: 11px; font-weight: normal; color: #444; margin-top: 2px; }
    .header-meta { margin-top: 10px; display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; font-size: 10px; }
    .header-meta .meta-item { border: 1px solid #ddd; padding: 4px 8px; border-radius: 3px; }
    .header-meta .meta-item strong { display: block; color: #1a3a5c; font-size: 9px; text-transform: uppercase; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #1a3a5c; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .print-btn:hover { background: #2563a8; }
    footer { border-top: 1px solid #ccc; margin-top: 20px; padding-top: 6px; font-size: 9px; color: #777; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">⊕ Imprimir / Salvar PDF</button>
  <div class="page">

    <!-- Cabeçalho -->
    <div class="header-top">
      <div class="header-brasao">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="22" stroke="#1a3a5c" stroke-width="2" fill="#eef2f7"/>
          <text x="24" y="28" text-anchor="middle" font-size="18" font-weight="bold" fill="#1a3a5c">⚖</text>
        </svg>
        <div>DJUD</div>
      </div>
      <div class="header-text" style="flex:1;">
        <h1>Ministério da Saúde — Departamento de Judicialização</h1>
        <h2>RELATÓRIO DE PESQUISA DE PREÇOS</h2>
        <h2>Instrução Normativa SEGES/ME nº 65, de 7 de julho de 2021</h2>
      </div>
    </div>

    <div class="header-meta">
      <div class="meta-item"><strong>Processo / Nº SEI</strong>${data.processo || "—"}</div>
      <div class="meta-item"><strong>Data de emissão</strong>${fmtDateLong(data.geradoEm)}</div>
      <div class="meta-item"><strong>Validade</strong>${fmtDateLong(validadeAte)}</div>
      <div class="meta-item"><strong>Órgão demandante</strong>${data.orgao || "—"}</div>
      <div class="meta-item"><strong>Responsável</strong>${data.responsavel || "—"}</div>
      <div class="meta-item"><strong>Sistema gerador</strong>DJUD Painel v1.0</div>
    </div>

    <hr style="margin: 16px 0; border-color:#ddd;"/>

    ${secao(1, "Identificação do Objeto",
      `<p style="font-size:11px;">O presente relatório tem por objeto a pesquisa de preços para aquisição de <strong>${data.termo.toUpperCase()}</strong>, conforme demanda constante no processo identificado acima.</p>`
    )}

    ${secao(2, "Especificação Técnica do Item",
      `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr><td style="border:1px solid #ccc;padding:4px 8px;width:30%;background:#f5f5f5;font-weight:bold;">Medicamento / Item</td><td style="border:1px solid #ccc;padding:4px 8px;">${data.termo.toUpperCase()}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Especificação / Apresentação</td><td style="border:1px solid #ccc;padding:4px 8px;">${data.especificacao || "Conforme demanda — ver processo"}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Unidade de medida</td><td style="border:1px solid #ccc;padding:4px 8px;">${data.unidade || "Unidade (UN)"}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Código CATMAT / CATSER</td><td style="border:1px solid #ccc;padding:4px 8px;">—</td></tr>
      </table>`
    )}

    ${secao(3, "Método de Pesquisa de Preços",
      `<p style="font-size:11px;margin-bottom:6px;">A pesquisa foi realizada em conformidade com o art. 5º da IN SEGES/ME nº 65/2021, consultando as seguintes bases de dados oficiais:</p>
      <ul style="padding-left:18px;font-size:11px;line-height:1.8;">
        <li><strong>CMED/ANVISA</strong> — Câmara de Regulação do Mercado de Medicamentos: preço máximo de venda ao governo (PMVG) como teto regulatório obrigatório.</li>
        <li><strong>BPS</strong> — Banco de Preços em Saúde (DATASUS/MS): registros de compras hospitalares públicas 2020–2024.</li>
        <li><strong>SIASG/Comprasnet</strong> — Sistema Integrado de Administração de Serviços Gerais: compras públicas com ação judicial (acao_judicial=1), anos 2000–2021.</li>
        <li><strong>PNCP</strong> — Portal Nacional de Contratações Públicas: contratos de materiais homologados, 2024–2025.</li>
      </ul>
      <p style="font-size:11px;margin-top:6px;">Para cada fonte, aplicou-se o método de remoção de outliers pelo intervalo interquartil (IQR), e o preço estimado foi calculado como a mediana da distribuição resultante. O preço de referência consolidado corresponde à mediana das medianas apuradas por fonte (método das medianas de medianas). Quando o preço de mercado supera o PMVG vigente, este último é adotado como teto obrigatório (Lei nº 10.742/2003, art. 3º, §2º).</p>`
    )}

    ${secao(4, "Resultado por Fonte — CMED/ANVISA (Preço-Teto Regulatório)", cmedContent)}
    ${secao(5, "Resultado por Fonte — BPS (Banco de Preços em Saúde)", bpsContent)}
    ${secao(6, "Resultado por Fonte — SIASG/Comprasnet (Compras com Ação Judicial)", siasgContent)}
    ${secao(7, "Resultado por Fonte — PNCP (Portal Nacional de Contratações Públicas)", pncpContent)}
    ${secao(8, "Análise Estatística e Apuração do Preço de Referência", analiseContent)}
    ${secao(9, "Conclusão, Recomendação, Validade e Responsável", conclusaoContent)}

    ${secao(10, "Referências Normativas",
      `<ul style="padding-left:18px;font-size:10px;line-height:1.8;color:#444;">
        <li>IN SEGES/ME nº 65, de 7 de julho de 2021 — Dispõe sobre o procedimento administrativo para a realização de pesquisa de preços para a aquisição de bens e contratação de serviços.</li>
        <li>Lei nº 10.742, de 6 de outubro de 2003 — Regulação econômica do mercado de medicamentos.</li>
        <li>Lei nº 14.133, de 1º de abril de 2021 — Lei de Licitações e Contratos Administrativos (art. 23).</li>
        <li>Resolução ANVISA — RDC nº 56/2021 — Tabela CMED de preços máximos de medicamentos.</li>
      </ul>`
    )}

    <footer>
      <span>Gerado automaticamente pelo sistema DJUD Painel — Ministério da Saúde · ${fmtDate(data.geradoEm)}</span>
      <span>IN SEGES/ME nº 65/2021 · Página <span style="font-style:italic;">impresso via navegador</span></span>
    </footer>
  </div>
</body>
</html>`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "relatorios:gerar")) {
      return NextResponse.json({ error: "Sem permissão para gerar relatórios" }, { status: 403 });
    }

    const body = await request.json();
    const { termo, orgao = "", responsavel = "", cargo = "", processo = "", especificacao = "", unidade = "UN" } = body;

    if (!termo || String(termo).trim().length < 3) {
      return NextResponse.json({ error: "Campo 'termo' obrigatório (mín. 3 caracteres)" }, { status: 400 });
    }

    const termoNorm = normalizar(String(termo).trim());
    const SAMPLE = 500;
    const TABELA = 10;

    const [cmedRows, bpsRows, siasgRows, pncpRows] = await Promise.all([
      db.precoCmed.findMany({ where: { substanciaNorm: { contains: termoNorm } }, orderBy: { substancia: "asc" }, take: 50 }),
      db.precoBps.findMany({ where: { nomeNorm: { contains: termoNorm } }, orderBy: { data: "desc" }, take: SAMPLE }),
      db.precoSiasg.findMany({ where: { nomeNorm: { contains: termoNorm }, acaoJudicial: true }, orderBy: { data: "desc" }, take: SAMPLE }),
      db.precoPncp.findMany({ where: { descricaoNorm: { contains: termoNorm } }, orderBy: { data: "desc" }, take: SAMPLE }),
    ]);

    const [totalBps, totalSiasg, totalPncp] = await Promise.all([
      db.precoBps.count({ where: { nomeNorm: { contains: termoNorm } } }),
      db.precoSiasg.count({ where: { nomeNorm: { contains: termoNorm }, acaoJudicial: true } }),
      db.precoPncp.count({ where: { descricaoNorm: { contains: termoNorm } } }),
    ]);

    const bpsResult = limparOutliers(bpsRows.map(r => r.preco).filter(v => v > 0));
    const siasgResult = limparOutliers(siasgRows.map(r => r.preco).filter(v => v > 0));
    const pncpResult = limparOutliers(pncpRows.map(r => r.valorUnitResultado).filter(v => v > 0));

    const bpsMediana = mediana(bpsResult.limpo);
    const siasgMediana = mediana(siasgResult.limpo);
    const pncpMediana = mediana(pncpResult.limpo);

    const fontes: string[] = [];
    const precosMercado: number[] = [];
    if (bpsMediana !== null) { fontes.push("BPS"); precosMercado.push(bpsMediana); }
    if (siasgMediana !== null) { fontes.push("SIASG"); precosMercado.push(siasgMediana); }
    if (pncpMediana !== null) { fontes.push("PNCP"); precosMercado.push(pncpMediana); }

    const precoRef = mediana(precosMercado);
    const pmvgMin = cmedRows.length ? Math.min(...cmedRows.map(r => r.pmvgSemImpostos)) : null;
    const capAplica = cmedRows.some(r => r.cap);
    const pmvgAplicado = pmvgMin !== null && precoRef !== null && precoRef > pmvgMin;
    const precoFinal = pmvgAplicado ? pmvgMin : precoRef;

    const observacoes: string[] = [];
    if (pmvgAplicado) observacoes.push(`Preço de mercado (${fmtBRL(precoRef)}) superior ao PMVG sem impostos (${fmtBRL(pmvgMin)}). Adotado PMVG como teto obrigatório.`);
    if (capAplica) observacoes.push("Produto sujeito ao desconto obrigatório CAP de 21,53% sobre o Preço de Fábrica (PF) nas aquisições não judiciais.");
    if (fontes.length < 3) observacoes.push(`Pesquisa baseada em apenas ${fontes.length} fonte(s) com dados disponíveis. Recomenda-se complementar com cotação direta a fornecedores ou distribuidores autorizados.`);
    if (bpsRows.length === 0 && siasgRows.length === 0 && pncpRows.length === 0) observacoes.push("Nenhum registro encontrado nas bases de mercado. O preço pode basear-se exclusivamente no PMVG/CMED.");

    const html = gerarHTML({
      termo: String(termo).trim(),
      orgao, responsavel, cargo, processo, especificacao, unidade,
      cmed: {
        total: cmedRows.length,
        pmvgMin,
        pmvgMax: cmedRows.length ? Math.max(...cmedRows.map(r => r.pmvgSemImpostos)) : null,
        registros: cmedRows.slice(0, TABELA),
      },
      bps: {
        total: totalBps, amostra: bpsRows.length,
        precoMin: bpsResult.limpo.length ? Math.min(...bpsResult.limpo) : null,
        precoMax: bpsResult.limpo.length ? Math.max(...bpsResult.limpo) : null,
        mediana: bpsMediana, removidos: bpsResult.removidos,
        registros: bpsRows.slice(0, TABELA),
      },
      siasg: {
        total: totalSiasg, amostra: siasgRows.length,
        precoMin: siasgResult.limpo.length ? Math.min(...siasgResult.limpo) : null,
        precoMax: siasgResult.limpo.length ? Math.max(...siasgResult.limpo) : null,
        mediana: siasgMediana, removidos: siasgResult.removidos,
        registros: siasgRows.slice(0, TABELA),
      },
      pncp: {
        total: totalPncp, amostra: pncpRows.length,
        precoMin: pncpResult.limpo.length ? Math.min(...pncpResult.limpo) : null,
        precoMax: pncpResult.limpo.length ? Math.max(...pncpResult.limpo) : null,
        mediana: pncpMediana, removidos: pncpResult.removidos,
        registros: pncpRows.slice(0, TABELA),
      },
      precoRef, precoFinal, pmvgAplicado, capAplica, fontes, observacoes,
      geradoEm: new Date(),
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "RelatorioPesquisaPreco",
        entityId: termoNorm,
        userId: session.user.id as string,
        metadata: { termo, orgao, processo, precoFinal, fontes },
      },
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="pesquisa_preco_${termoNorm.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch (error) {
    console.error("[relatorios/pesquisa-preco]", error);
    return NextResponse.json({ error: "Erro ao gerar relatório" }, { status: 500 });
  }
}
