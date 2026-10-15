import { PassThrough, Readable } from "node:stream";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizarPrincipioAtivo } from "@/lib/principio-ativo";
import {
  AGRUPAMENTOS,
  ROTULO_COLUNA,
  type Agrupamento,
  type ColunaExport,
} from "@/lib/demandas-colunas";
import { ROTULO_NAO_INFORMADO, ROTULO_SEM_APRESENTACAO, comboCanonico, rotuloValor } from "@/lib/demandas-filtro-tipos";
import { AZUL, esc, fmtDateLong } from "@/lib/relatorio-pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Exportação das demandas (A2): CSV, XLSX ou HTML, com as colunas escolhidas e,
// se pedido, agrupadas com subtotais. Sem teto silencioso — o arquivo traz
// TODAS as demandas do recorte (a lista antiga parava em 10.000).
//
// A resposta sai em streaming: com ~59 mil demandas o arquivo passa do limite
// de corpo das funções da Vercel (4,5 MB) se for montado inteiro na memória.
// CSV no padrão de lib/metrics-export.ts: ";" e vírgula decimal, com BOM.
// ─────────────────────────────────────────────────────────────────────────────

const LOTE = 5000;

const SELECAO = {
  id: true,
  numero: true,
  numeroProcesso: true,
  nupSei: true,
  titulo: true,
  principioAtivo: true,
  medicamento: true,
  medicamentoOrigem: true,
  apresentacoes: true,
  status: true,
  pontoControle: true,
  prioridade: true,
  areaTematica: true,
  objetoAcao: true,
  trfRegiao: true,
  regiaoBrasil: true,
  ufResidencia: true,
  formaCumprimento: true,
  origemDemanda: true,
  dataEntradaDJUD: true,
  criadoEm: true,
  valorEstimado: true,
  responsavel: { select: { name: true } },
} satisfies Prisma.DemandaSelect;

type LinhaBanco = Prisma.DemandaGetPayload<{ select: typeof SELECAO }>;

export interface ContextoExportDemandas {
  geradoEm: Date;
  responsavel: string;
  filtros: Array<[string, string]>;
  colunas: ColunaExport[];
  agrupar: Agrupamento | null;
}

/** Todas as demandas do recorte, em lotes por id (cursor) — sem limite. */
export async function lerDemandasParaExportar(where: Prisma.DemandaWhereInput): Promise<LinhaBanco[]> {
  const linhas: LinhaBanco[] = [];
  let cursor: string | null = null;
  for (;;) {
    const lote: LinhaBanco[] = await db.demanda.findMany({
      where,
      select: SELECAO,
      orderBy: { id: "asc" },
      take: LOTE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    linhas.push(...lote);
    if (lote.length < LOTE) return linhas;
    cursor = lote[lote.length - 1].id;
  }
}

// ── Valores ──────────────────────────────────────────────────────────────────

const dataBr = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const numeroBr = (v: number) => v.toFixed(2).replace(".", ",");

function medicamentoDe(l: LinhaBanco): string | null {
  return l.medicamento ?? normalizarPrincipioAtivo(l.principioAtivo);
}

type ApresentacaoGravada = { catmat: string; descricao: string | null; origem: string; unidades?: string[] };

/** "CATMAT 410020 — ELTROMBOPAG… (SISMAT)"; vazio quando não identificada. */
function apresentacaoDe(l: LinhaBanco): string {
  const lista = (Array.isArray(l.apresentacoes) ? l.apresentacoes : []) as ApresentacaoGravada[];
  return lista
    .map((a) => `CATMAT ${a.catmat}${a.descricao ? ` — ${a.descricao}` : ""}${a.unidades?.length ? ` [${a.unidades.join(", ")}]` : ""} (${a.origem})`)
    .join("; ");
}

/** Texto da célula (CSV e HTML). */
function texto(l: LinhaBanco, c: ColunaExport): string {
  switch (c) {
    case "trfRegiao":
      return l.trfRegiao ? rotuloValor("trfRegiao", String(l.trfRegiao)) : "";
    case "formaCumprimento":
      return l.formaCumprimento ? rotuloValor("formaCumprimento", l.formaCumprimento) : "";
    case "dataEntradaDJUD":
      return dataBr(l.dataEntradaDJUD);
    case "criadoEm":
      return l.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    case "valorEstimado":
      return l.valorEstimado === null ? "" : numeroBr(Number(l.valorEstimado));
    case "responsavel":
      return l.responsavel?.name ?? "";
    case "medicamento":
      return medicamentoDe(l) ?? "";
    case "apresentacao":
      return apresentacaoDe(l) || ROTULO_SEM_APRESENTACAO;
    default:
      return String(l[c] ?? "");
  }
}

/** Valor tipado da célula no XLSX (data como data, valor como número). */
function valorXlsx(l: LinhaBanco, c: ColunaExport): string | number | Date | null {
  switch (c) {
    case "dataEntradaDJUD":
      return l.dataEntradaDJUD;
    case "criadoEm":
      return l.criadoEm;
    case "valorEstimado":
      return l.valorEstimado === null ? null : Number(l.valorEstimado);
    case "trfRegiao":
      return l.trfRegiao;
    default:
      return texto(l, c) || null;
  }
}

export function chaveDoGrupo(l: LinhaBanco, agrupar: Agrupamento): string {
  switch (agrupar) {
    case "trfRegiao":
      return l.trfRegiao ? rotuloValor("trfRegiao", String(l.trfRegiao)) : ROTULO_NAO_INFORMADO;
    case "medicamento":
      return medicamentoDe(l) ?? "(medicamento não identificado)";
    case "apresentacao": {
      const lista = (Array.isArray(l.apresentacoes) ? l.apresentacoes : []) as ApresentacaoGravada[];
      return lista.length ? lista.map((a) => `CATMAT ${a.catmat}`).join(" + ") : `(${ROTULO_SEM_APRESENTACAO})`;
    }
    case "pontoControle":
      // A mesma combinação em ordens diferentes ("A | B", "B | A") é um grupo só.
      return l.pontoControle ? comboCanonico(l.pontoControle) : ROTULO_NAO_INFORMADO;
    default:
      return l[agrupar] ?? ROTULO_NAO_INFORMADO;
  }
}

const ROTULO_AGRUPAMENTO = Object.fromEntries(AGRUPAMENTOS.map((a) => [a.id, a.rotulo])) as Record<Agrupamento, string>;

interface Grupo {
  chave: string;
  linhas: LinhaBanco[];
  valor: number;
}

/** Linhas em grupos (por chave, em ordem alfabética; "(não informado)" no fim). */
function agrupar(linhas: LinhaBanco[], por: Agrupamento | null): Grupo[] {
  const porNumero = (a: LinhaBanco, b: LinhaBanco) =>
    Number(a.numero) - Number(b.numero) || a.numero.localeCompare(b.numero);
  if (!por) return [{ chave: "", linhas: [...linhas].sort(porNumero), valor: 0 }];
  const mapa = new Map<string, LinhaBanco[]>();
  for (const l of linhas) {
    const k = chaveDoGrupo(l, por);
    const lista = mapa.get(k) ?? [];
    lista.push(l);
    mapa.set(k, lista);
  }
  // "Apresentação não identificada" é sempre um grupo, mesmo vazio (A5).
  if (por === "apresentacao" && !mapa.has(`(${ROTULO_SEM_APRESENTACAO})`)) mapa.set(`(${ROTULO_SEM_APRESENTACAO})`, []);
  const fim = (k: string) => k.startsWith("(");
  return Array.from(mapa.entries())
    .sort(([a], [b]) => (fim(a) !== fim(b) ? (fim(a) ? 1 : -1) : a.localeCompare(b, "pt-BR", { numeric: true })))
    .map(([chave, ls]) => ({
      chave,
      linhas: ls.sort(porNumero),
      valor: ls.reduce((s, l) => s + (l.valorEstimado === null ? 0 : Number(l.valorEstimado)), 0),
    }));
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const campo = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const linhaCsv = (...v: unknown[]) => v.map(campo).join(";");

export function* csvDemandas(linhas: LinhaBanco[], ctx: ContextoExportDemandas): Generator<string> {
  const comValor = ctx.colunas.includes("valorEstimado");
  yield "﻿";
  yield `${linhaCsv("Exportação de demandas — DJUD Painel")}\r\n`;
  yield `${linhaCsv("Gerado em", ctx.geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "por", ctx.responsavel)}\r\n`;
  for (const [k, v] of ctx.filtros.length ? ctx.filtros : [["Filtros", "nenhum — toda a base"] as [string, string]]) {
    yield `${linhaCsv(k, v)}\r\n`;
  }
  yield `${linhaCsv("Total de demandas", linhas.length)}\r\n\r\n`;

  const grupos = agrupar(linhas, ctx.agrupar);
  const cab = ctx.colunas.map((c) => ROTULO_COLUNA[c]);
  yield `${linhaCsv(...(ctx.agrupar ? [ROTULO_AGRUPAMENTO[ctx.agrupar], ...cab] : cab))}\r\n`;
  for (const g of grupos) {
    let bloco: string[] = [];
    for (const l of g.linhas) {
      const celulas = ctx.colunas.map((c) => texto(l, c));
      bloco.push(linhaCsv(...(ctx.agrupar ? [g.chave, ...celulas] : celulas)));
      if (bloco.length >= 1000) {
        yield `${bloco.join("\r\n")}\r\n`;
        bloco = [];
      }
    }
    if (bloco.length) yield `${bloco.join("\r\n")}\r\n`;
  }

  if (ctx.agrupar) {
    yield `\r\n${linhaCsv(`Subtotais por ${ROTULO_AGRUPAMENTO[ctx.agrupar].toLowerCase()}`)}\r\n`;
    yield `${linhaCsv(ROTULO_AGRUPAMENTO[ctx.agrupar], "Demandas", ...(comValor ? ["Valor do depósito (R$)"] : []))}\r\n`;
    for (const g of grupos) {
      yield `${linhaCsv(g.chave, g.linhas.length, ...(comValor ? [numeroBr(g.valor)] : []))}\r\n`;
    }
    yield `${linhaCsv("Total", linhas.length, ...(comValor ? [numeroBr(grupos.reduce((s, g) => s + g.valor, 0))] : []))}\r\n`;
  }
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const th = (s: string) => `<th style="border:1px solid #ccc;padding:3px 5px;background:#eef2f7;text-align:left;">${esc(s)}</th>`;
const td = (s: string) => `<td style="border:1px solid #ddd;padding:3px 5px;vertical-align:top;">${esc(s)}</td>`;

export function* htmlDemandas(linhas: LinhaBanco[], ctx: ContextoExportDemandas): Generator<string> {
  const comValor = ctx.colunas.includes("valorEstimado");
  const grupos = agrupar(linhas, ctx.agrupar);
  yield `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Demandas — DJUD Painel</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  @media print { .no-print { display: none !important; } body { background: white !important; } }
  body { font-family: "Times New Roman", Times, serif; font-size: 10px; color: #111; background: #f0f0f0; margin: 0; }
  .page { background: white; margin: 16px auto; padding: 18px 22px; max-width: 1400px; }
  h1 { font-size: 14px; color: ${AZUL}; margin: 0 0 4px; text-transform: uppercase; }
  table { border-collapse: collapse; width: 100%; }
  .grupo { margin-top: 14px; font-size: 11px; font-weight: bold; color: ${AZUL}; border-left: 3px solid ${AZUL}; padding-left: 6px; }
  .print-btn { position: fixed; top: 12px; right: 12px; background: ${AZUL}; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
</style></head><body>
<button class="no-print print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
<div class="page">
<h1>Ministério da Saúde — Demandas Judiciais (DJUD)</h1>
<p>Emitido em ${esc(fmtDateLong(ctx.geradoEm))} por ${esc(ctx.responsavel || "—")} · <strong>${linhas.length.toLocaleString("pt-BR")}</strong> demanda(s).</p>
<table style="margin:8px 0 12px;width:auto;">${(ctx.filtros.length ? ctx.filtros : [["Filtros", "nenhum — toda a base"] as [string, string]])
    .map(([k, v]) => `<tr><td style="padding:1px 8px 1px 0;font-weight:bold;">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join("")}</table>
`;
  const cabecalho = `<tr>${ctx.colunas.map((c) => th(ROTULO_COLUNA[c])).join("")}</tr>`;
  for (const g of grupos) {
    if (ctx.agrupar) {
      yield `<div class="grupo">${esc(ROTULO_AGRUPAMENTO[ctx.agrupar])}: ${esc(g.chave)} — ${g.linhas.length.toLocaleString("pt-BR")} demanda(s)${
        comValor ? ` · R$ ${esc(numeroBr(g.valor))}` : ""
      }</div>`;
    }
    yield `<table>${cabecalho}`;
    let bloco: string[] = [];
    for (const l of g.linhas) {
      bloco.push(`<tr>${ctx.colunas.map((c) => td(texto(l, c))).join("")}</tr>`);
      if (bloco.length >= 500) {
        yield bloco.join("");
        bloco = [];
      }
    }
    yield `${bloco.join("")}</table>`;
  }
  if (ctx.agrupar) {
    yield `<div class="grupo">Subtotais por ${esc(ROTULO_AGRUPAMENTO[ctx.agrupar].toLowerCase())}</div><table style="width:auto;"><tr>${th(
      ROTULO_AGRUPAMENTO[ctx.agrupar]
    )}${th("Demandas")}${comValor ? th("Valor do depósito (R$)") : ""}</tr>${grupos
      .map((g) => `<tr>${td(g.chave)}${td(g.linhas.length.toLocaleString("pt-BR"))}${comValor ? td(numeroBr(g.valor)) : ""}</tr>`)
      .join("")}</table>`;
  }
  yield `<p style="margin-top:14px;color:#777;font-size:9px;">Gerado pelo DJUD Painel. O recorte acima é o mesmo da lista de Demandas e do Dashboard.</p></div></body></html>`;
}

// ── XLSX (exceljs em streaming; só no servidor) ──────────────────────────────

export async function xlsxDemandas(linhas: LinhaBanco[], ctx: ContextoExportDemandas): Promise<ReadableStream<Uint8Array>> {
  const ExcelJS = (await import("exceljs")).default;
  const saida = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false });
  const grupos = agrupar(linhas, ctx.agrupar);
  const comValor = ctx.colunas.includes("valorEstimado");
  const filtros: Array<[string, string]> = ctx.filtros.length ? ctx.filtros : [["Filtros", "nenhum — toda a base"]];
  const linhaCab = 4 + filtros.length + 1;

  const escrever = async () => {
    const ws = wb.addWorksheet("Demandas", {
      views: [{ state: "frozen", ySplit: linhaCab }],
    });
    ws.columns = ctx.colunas.map((c) => ({
      key: c,
      width: c === "titulo" ? 48 : c === "principioAtivo" || c === "medicamento" ? 30 : c === "numeroProcesso" ? 27 : 18,
    }));
    ws.addRow(["Exportação de demandas — DJUD Painel"]).font = { bold: true, size: 13 };
    ws.addRow([`Gerado em ${ctx.geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por ${ctx.responsavel || "—"}`]);
    ws.addRow([`Total: ${linhas.length.toLocaleString("pt-BR")} demanda(s)`]);
    for (const [k, v] of filtros) ws.addRow([`${k}: ${v}`]);
    ws.addRow([]);
    const cab = ws.addRow(ctx.colunas.map((c) => ROTULO_COLUNA[c]));
    cab.font = { bold: true };
    cab.eachCell((cell) => {
      cell.border = { bottom: { style: "thin" } };
    });
    cab.commit();

    for (const g of grupos) {
      if (ctx.agrupar) {
        const r = ws.addRow([`${ROTULO_AGRUPAMENTO[ctx.agrupar]}: ${g.chave} — ${g.linhas.length.toLocaleString("pt-BR")} demanda(s)`]);
        r.font = { bold: true };
        r.commit();
      }
      for (const l of g.linhas) {
        const r = ws.addRow(ctx.colunas.map((c) => valorXlsx(l, c)));
        ctx.colunas.forEach((c, i) => {
          const cell = r.getCell(i + 1);
          if (c === "dataEntradaDJUD" || c === "criadoEm") cell.numFmt = "dd/mm/yyyy";
          if (c === "valorEstimado") cell.numFmt = "#,##0.00";
        });
        r.commit();
      }
      if (ctx.agrupar) {
        const r = ws.addRow([`Subtotal — ${g.chave}: ${g.linhas.length.toLocaleString("pt-BR")} demanda(s)${comValor ? ` · R$ ${numeroBr(g.valor)}` : ""}`]);
        r.font = { italic: true };
        r.commit();
      }
    }
    ws.commit();

    if (ctx.agrupar) {
      const resumo = wb.addWorksheet("Subtotais");
      resumo.columns = [{ width: 48 }, { width: 14 }, { width: 22 }];
      const c = resumo.addRow([ROTULO_AGRUPAMENTO[ctx.agrupar], "Demandas", ...(comValor ? ["Valor do depósito (R$)"] : [])]);
      c.font = { bold: true };
      c.commit();
      for (const g of grupos) {
        const r = resumo.addRow([g.chave, g.linhas.length, ...(comValor ? [g.valor] : [])]);
        if (comValor) r.getCell(3).numFmt = "#,##0.00";
        r.commit();
      }
      const t = resumo.addRow(["Total", linhas.length, ...(comValor ? [grupos.reduce((s, g) => s + g.valor, 0)] : [])]);
      t.font = { bold: true };
      if (comValor) t.getCell(3).numFmt = "#,##0.00";
      t.commit();
      resumo.commit();
    }
    await wb.commit();
  };
  escrever().catch((erro) => saida.destroy(erro instanceof Error ? erro : new Error(String(erro))));
  return Readable.toWeb(saida) as unknown as ReadableStream<Uint8Array>;
}

/** Gerador de texto → ReadableStream (CSV e HTML). */
export function streamDeTexto(gerador: Generator<string>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const { value, done } = gerador.next();
      if (done) controller.close();
      else controller.enqueue(enc.encode(value));
    },
  });
}
