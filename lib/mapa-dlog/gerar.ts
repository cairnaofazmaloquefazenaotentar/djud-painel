import ExcelJS from "exceljs";
import {
  ABA,
  ALTURA,
  CABECALHO_BASE,
  CABECALHO_CMED,
  CABECALHO_CONSOLIDACAO,
  CABECALHO_IPCA,
  CABECALHO_MEMORIA,
  CABECALHO_PAINEL,
  COR,
  FORMATO,
  LARGURA_CMED,
  LARGURA_CONSOLIDACAO,
  LARGURA_ITEM,
  LARGURA_MEMORIA,
  LINHA_CABECALHO_BASE,
  PRIMEIRA_LINHA_BASE,
  TITULO,
  ref,
} from "@/lib/mapa-dlog/layout";
import { notaConsolidacao, type LinhaBase, type MapaItem } from "@/lib/mapa-dlog/dados";

// ─────────────────────────────────────────────────────────────────────────────
// Mapa comparativo de preços no modelo da DLOG — gravação do XLSX (servidor).
//
// Abas, ordem, títulos, cabeçalhos A–X e posição dos blocos são os da
// planilha da DLOG; o que o painel acrescenta fica à direita ou abaixo, sem
// deslocar nada. As diferenças são de propósito e corrigem os erros listados
// na seção 8.5 da avaliação:
//   • fórmulas só para a aba do próprio item e sobre a coluna auxiliar AA
//     ("Preço considerado" = X se Compõe = Sim), então "Compõe = Não" sai de
//     todas as contas e nenhuma estatística escolhe células à mão;
//   • preço adotado por fórmula (método do item, limitado ao teto), nunca
//     digitado; nota da Consolidação gerada pelo que foi usado de fato;
//   • IPCA por INDEX/MATCH sobre data (nunca VLOOKUP por mês em texto) e fator
//     composto vindo da tabela de índices;
//   • preços da CMED como número, divisor da unidade pelo Qt_Embal da linha.
//
// Toda fórmula é gravada com o resultado já calculado pela pesquisa: o arquivo
// abre com os números certos mesmo em visualizador que não recalcula (e-mail,
// celular, SEI). O Excel recalcula ao abrir (fullCalcOnLoad) e chega ao mesmo
// número — é o que scripts/conferir_mapa_dlog.py confere.
// ─────────────────────────────────────────────────────────────────────────────

export interface IndiceIpcaMapa {
  /** "2026-03-01". */
  competencia: string;
  variacaoMensal: number | null;
  numeroIndice: number;
}

export interface MetaMapa {
  processo: string;
  orgao: string;
  responsavel: string;
  cargo: string;
  /** Quem gerou (nome ou e-mail da sessão). */
  usuario: string;
  geradoEm: Date;
  /** Data de referência da pesquisa (art. 5º); hoje, a data de emissão. */
  dataReferencia: Date;
  /** Vigência da tabela CMED carregada no painel. */
  cmedVigencia: Date | null;
  /** Publicação oficial da lista CMED usada, quando conhecida. */
  cmedPublicacao: Date | null;
  /** Lista mensal do teto ("ago/2026"); null sem as listas mensais. */
  cmedLista?: string | null;
  /** Linhas "fonte — situação" para a aba Parâmetros. */
  fontesConsultadas: string[];
  /** Período aplicado às fontes (texto para a aba Parâmetros). */
  periodo: string;
  ipca: {
    ligado: boolean;
    /** "2026-08" */
    mesBase: string | null;
    convencao: string;
    indices: IndiceIpcaMapa[];
  };
  versaoDados: string | null;
  /** SHA-256 do conteúdo (dados da pesquisa), impresso na aba Parâmetros. */
  hashConteudo: string;
  /** Filtros e UF por item, já em texto. */
  filtrosPorItem: Map<number, string>;
}

// ── Estilo ───────────────────────────────────────────────────────────────────

const argb = (hex: string) => ({ argb: `FF${hex}` });
const preenchimento = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: argb(hex) });
const linhaFina: Partial<ExcelJS.Border> = { style: "thin", color: argb(COR.borda) };
const BORDA: Partial<ExcelJS.Borders> = { top: linhaFina, left: linhaFina, bottom: linhaFina, right: linhaFina };
const FONTE = "Calibri";

/** Caracteres de controle e surrogates soltos fazem o Excel "reparar" o arquivo. */
export function limparTexto(v: unknown, max = 32_000): string {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F￾￿]/g, " ")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .slice(0, max);
}

/** Data ISO (só a parte da data) → Date em UTC, que o exceljs grava sem deslocar o dia. */
function dataUtc(iso: string | null): Date | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(Date.UTC(a, m - 1, d));
}

/** Instante → mesma data e hora do relógio de Brasília, codificada em UTC (o Excel não tem fuso). */
function horaLocal(instante: Date | string | null): Date | null {
  if (!instante) return null;
  const d = typeof instante === "string" ? new Date(instante) : instante;
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return new Date(
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second))
  );
}

function fmtDataHora(d: Date): string {
  const l = horaLocal(d) as Date;
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(l.getUTCDate())}/${z(l.getUTCMonth() + 1)}/${l.getUTCFullYear()} ${z(l.getUTCHours())}:${z(l.getUTCMinutes())}`;
}

function fmtData(d: Date): string {
  const l = horaLocal(d) as Date;
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(l.getUTCDate())}/${z(l.getUTCMonth() + 1)}/${l.getUTCFullYear()}`;
}

/** Data de calendário gravada à meia-noite UTC (vigência, publicação): sem fuso. */
function fmtDataCalendario(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

type Resultado = number | string;

/** Fórmula com o resultado da pesquisa já gravado. */
function formula(cell: ExcelJS.Cell, f: string, resultado: number | null | undefined | string, numFmt?: string) {
  const r: Resultado = typeof resultado === "number" && Number.isFinite(resultado) ? resultado : typeof resultado === "string" ? resultado : "";
  cell.value = { formula: f, result: r };
  if (numFmt) cell.numFmt = numFmt;
}

function valor(cell: ExcelJS.Cell, v: unknown, numFmt?: string) {
  if (v === null || v === undefined || v === "") {
    cell.value = null;
  } else if (typeof v === "number") {
    cell.value = Number.isFinite(v) ? v : null;
  } else if (v instanceof Date) {
    cell.value = v;
  } else {
    cell.value = limparTexto(v);
  }
  if (numFmt) cell.numFmt = numFmt;
}

function estiloCabecalho(cell: ExcelJS.Cell, tamanho = 10, fundo: string = COR.azulEscuro, corTexto: string = COR.branco) {
  cell.font = { name: FONTE, size: tamanho, bold: true, color: argb(corTexto) };
  cell.fill = preenchimento(fundo);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = BORDA;
}

function estiloRotulo(cell: ExcelJS.Cell) {
  cell.font = { name: FONTE, size: 10, bold: true };
  cell.fill = preenchimento(COR.azulClaro);
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = BORDA;
}

function estiloValor(cell: ExcelJS.Cell, extra: Partial<ExcelJS.Alignment> = {}) {
  cell.font = { name: FONTE, size: 10 };
  cell.alignment = { vertical: "middle", wrapText: true, ...extra };
  cell.border = BORDA;
}

/** Faixa mesclada com título. */
function faixaTitulo(ws: ExcelJS.Worksheet, faixa: string, texto: string, fonte: Partial<ExcelJS.Font>, fundo?: string) {
  ws.mergeCells(faixa);
  const cell = ws.getCell(faixa.split(":")[0]);
  cell.value = limparTexto(texto);
  cell.font = { name: FONTE, ...fonte };
  cell.alignment = { vertical: "middle", horizontal: fundo ? "center" : "left", wrapText: true };
  if (fundo) cell.fill = preenchimento(fundo);
}

function larguras(ws: ExcelJS.Worksheet, valores: number[]) {
  valores.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** Link para outra aba por fórmula — o hiperlink nativo do exceljs cria uma relação externa. */
function linkInterno(cell: ExcelJS.Cell, aba: string, texto: string) {
  const alvo = `#${ref(aba, "A1")}`.replace(/"/g, '""');
  formula(cell, `HYPERLINK("${alvo}","${texto.replace(/"/g, '""')}")`, texto);
  cell.font = { name: FONTE, size: 10, color: argb("0563C1"), underline: true };
}

function letra(coluna: number): string {
  let s = "";
  let n = coluna;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── Planejamento da aba CMED (a aba do item aponta para a linha do teto) ─────

interface PlanoCmed {
  /** Linha do "ITEM n". */
  inicio: number;
  /** Linha da CMED que forma o teto do item; null = sem teto. */
  linhaTeto: number | null;
}

const LINHA_INICIAL_CMED = 5;

function planejarCmed(itens: MapaItem[]): Map<number, PlanoCmed> {
  const plano = new Map<number, PlanoCmed>();
  let linha = LINHA_INICIAL_CMED;
  for (const item of itens) {
    const primeira = linha + 2;
    const idx = item.cmed.findIndex((c) => c.formaTeto);
    plano.set(item.numero, { inicio: linha, linhaTeto: idx >= 0 ? primeira + idx : null });
    linha = primeira + Math.max(1, item.cmed.length) + 1;
  }
  return plano;
}

// ── Consolidação ─────────────────────────────────────────────────────────────

function abaConsolidacao(wb: ExcelJS.Workbook, itens: MapaItem[], meta: MetaMapa) {
  const ws = wb.addWorksheet(ABA.consolidacao, { views: [{ state: "frozen", ySplit: 5 }] });
  larguras(ws, LARGURA_CONSOLIDACAO);
  faixaTitulo(ws, "A1:H1", TITULO.consolidacao, { size: 18, bold: true, color: argb(COR.azul) });
  faixaTitulo(ws, "A2:H2", TITULO.consolidacaoSub, { size: 12, color: argb(COR.cinza) });
  ws.getRow(3).height = ALTURA.faixa;
  for (let c = 1; c <= 8; c++) ws.getCell(3, c).fill = preenchimento(COR.azul);
  faixaTitulo(
    ws,
    "A4:H4",
    `Processo SEI: ${meta.processo || "não informado"} · Data de referência: ${fmtData(meta.dataReferencia)} · Gerado pelo Painel DJUD em ${fmtDataHora(meta.geradoEm)} por ${meta.usuario}`,
    { size: 9, color: argb(COR.cinza) }
  );

  CABECALHO_CONSOLIDACAO.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = h;
    estiloCabecalho(cell);
  });
  ws.getRow(5).height = 30;

  let linha = 6;
  for (const [i, item] of itens.entries()) {
    const zebra = i % 2 === 0 ? COR.azulClaro : COR.branco;
    linkInterno(ws.getCell(linha, 1), item.aba, item.aba);
    formula(ws.getCell(linha, 2), ref(item.aba, "B2"), item.medicamento);
    formula(ws.getCell(linha, 3), ref(item.aba, "B3"), item.catmat, "0");
    formula(ws.getCell(linha, 4), ref(item.aba, "F3"), item.quantidade, FORMATO.inteiro);
    formula(ws.getCell(linha, 5), ref(item.aba, "B12"), item.precoAdotado, FORMATO.moeda);
    formula(ws.getCell(linha, 6), ref(item.aba, "F12"), item.descricaoMetodo);
    formula(ws.getCell(linha, 7), `IF(ISNUMBER(E${linha}),D${linha}*E${linha},"")`, item.valorTotal, FORMATO.moeda);
    valor(ws.getCell(linha, 8), item.status);
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(linha, c);
      if (c !== 1) cell.font = { name: FONTE, size: 10 };
      cell.fill = preenchimento(zebra);
      cell.border = BORDA;
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c === 2 || c === 6 ? "left" : "center" };
    }
    linha += 1;
  }

  const ultima = Math.max(6, linha - 1);
  const total = itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  ws.mergeCells(linha, 1, linha, 6);
  const rotulo = ws.getCell(linha, 1);
  rotulo.value = "TOTAL GERAL";
  ws.mergeCells(linha, 7, linha, 8);
  formula(ws.getCell(linha, 7), `SUM(G6:G${ultima})`, total, FORMATO.moeda);
  for (const c of [1, 7]) {
    const cell = ws.getCell(linha, c);
    cell.font = { name: FONTE, size: 11, bold: true, color: argb(COR.branco) };
    cell.fill = preenchimento(COR.azulEscuro);
    cell.alignment = { horizontal: c === 1 ? "right" : "center", vertical: "middle" };
  }

  const nota = linha + 2;
  faixaTitulo(ws, `A${nota}:H${nota}`, notaConsolidacao(itens), { size: 8, color: argb(COR.cinza) });
  ws.getRow(nota).height = 36;
}

// ── Memória de cálculo ───────────────────────────────────────────────────────

function abaMemoria(wb: ExcelJS.Workbook, itens: MapaItem[]) {
  const ws = wb.addWorksheet(ABA.memoria, { views: [{ state: "frozen", ySplit: 5 }] });
  larguras(ws, LARGURA_MEMORIA);
  faixaTitulo(ws, "A1:K1", TITULO.memoria, { size: 18, bold: true, color: argb(COR.azulEscuro) });
  faixaTitulo(ws, "A2:K2", TITULO.memoriaSub, { size: 12, color: argb(COR.azul) });
  ws.getRow(3).height = ALTURA.faixa;
  for (let c = 1; c <= 11; c++) ws.getCell(3, c).fill = preenchimento(COR.azulEscuro);

  CABECALHO_MEMORIA.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = h;
    estiloCabecalho(cell, 9);
  });
  ws.getRow(5).height = 30;

  let linha = 6;
  for (const [i, item] of itens.entries()) {
    const e = item.conjuntoUnico;
    const zebra = i % 2 === 0 ? COR.azulClaro : COR.branco;
    linkInterno(ws.getCell(linha, 1), item.aba, item.aba);
    formula(ws.getCell(linha, 2), ref(item.aba, "B2"), item.medicamento);
    formula(ws.getCell(linha, 3), ref(item.aba, "B3"), item.catmat, "0");
    formula(ws.getCell(linha, 4), ref(item.aba, "E8"), e.n, FORMATO.inteiro);
    formula(ws.getCell(linha, 5), ref(item.aba, "B6"), e.menor, FORMATO.precoUnitario);
    formula(ws.getCell(linha, 6), ref(item.aba, "B7"), e.maior, FORMATO.precoUnitario);
    formula(ws.getCell(linha, 7), ref(item.aba, "B8"), e.media, FORMATO.precoUnitario);
    formula(ws.getCell(linha, 8), ref(item.aba, "B9"), e.mediana, FORMATO.precoUnitario);
    formula(
      ws.getCell(linha, 9),
      ref(item.aba, "E7"),
      e.coefVariacao === null ? "" : e.coefVariacao / 100,
      FORMATO.percentual
    );
    formula(ws.getCell(linha, 10), ref(item.aba, "F12"), item.descricaoMetodo);
    formula(ws.getCell(linha, 11), ref(item.aba, "B12"), item.precoAdotado, FORMATO.precoUnitario);
    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(linha, c);
      if (c !== 1) cell.font = { name: FONTE, size: 9 };
      cell.fill = preenchimento(zebra);
      cell.border = BORDA;
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c === 2 || c === 10 ? "left" : "center" };
    }
    linha += 1;
  }

  const titulo = linha + 1;
  faixaTitulo(ws, `A${titulo}:K${titulo}`, TITULO.justificativa, { size: 11, bold: true, color: argb(COR.branco) }, COR.azulEscuro);
  const corpo = titulo + 1;
  const texto = itens.map((i) => `${i.aba} — ${i.medicamento}: ${i.justificativa}`).join("\n\n");
  faixaTitulo(ws, `A${corpo}:K${corpo}`, texto, { size: 9 });
  ws.getCell(corpo, 1).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  // Altura proporcional ao texto (o Excel não ajusta linha mesclada sozinho).
  ws.getRow(corpo).height = Math.min(409, Math.max(ALTURA.justificativaMemoria, 15 * Math.ceil(texto.length / 160) + 15 * itens.length));
}

// ── Aba do item ──────────────────────────────────────────────────────────────

/** Expressão do método do item sobre o resumo (B6:B9) ou o bloco por fonte. */
function expressaoMetodo(item: MapaItem, celulaMedianaDasMedianas: string | null): { expr: string; temPreco: string } {
  switch (item.metodo) {
    case "mediana_medianas":
      return celulaMedianaDasMedianas
        ? { expr: celulaMedianaDasMedianas, temPreco: `ISNUMBER(${celulaMedianaDasMedianas})` }
        : { expr: '""', temPreco: "FALSE" };
    case "criterio_dlog":
      return { expr: "MIN(B8,B9)", temPreco: "E8>0" };
    case "media_registros":
      return { expr: "B8", temPreco: "E8>0" };
    case "mediana_registros":
      return { expr: "B9", temPreco: "E8>0" };
    case "menor_registros":
      return { expr: "B6", temPreco: "E8>0" };
  }
}

function abaDoItem(wb: ExcelJS.Workbook, item: MapaItem, plano: PlanoCmed | undefined) {
  const ws = wb.addWorksheet(item.aba);
  larguras(ws, LARGURA_ITEM);

  // Dados do medicamento
  faixaTitulo(ws, "A1:F1", TITULO.dadosMedicamento, { size: 12, bold: true, color: argb(COR.branco) }, COR.azulEscuro);
  ws.getCell("A2").value = "Medicamento:";
  estiloRotulo(ws.getCell("A2"));
  ws.mergeCells("B2:F2");
  valor(ws.getCell("B2"), item.medicamento);
  estiloValor(ws.getCell("B2"));
  ws.getCell("A3").value = "CATMAT:";
  estiloRotulo(ws.getCell("A3"));
  valor(ws.getCell("B3"), item.catmat, "0");
  estiloValor(ws.getCell("B3"), { horizontal: "center" });
  valor(ws.getCell("C3"), item.descricaoCatmat);
  estiloValor(ws.getCell("C3"));
  valor(ws.getCell("D3"), item.unidade);
  estiloValor(ws.getCell("D3"), { horizontal: "center" });
  ws.getCell("E3").value = "Quantidade:";
  estiloRotulo(ws.getCell("E3"));
  valor(ws.getCell("F3"), item.quantidade, FORMATO.inteiro);
  estiloValor(ws.getCell("F3"), { horizontal: "center" });
  ws.getRow(3).height = 45;

  const n = item.linhas.length;
  const fim = Math.max(PRIMEIRA_LINHA_BASE, PRIMEIRA_LINHA_BASE + n - 1);
  const faixa = (col: string) => `${col}${PRIMEIRA_LINHA_BASE}:${col}${fim}`;
  const AA = faixa("AA");
  const e = item.conjuntoUnico;

  // Resumo estatístico — o conjunto único (coluna AA: X quando Compõe = Sim).
  faixaTitulo(ws, "A5:F5", TITULO.resumo, { size: 11, bold: true, color: argb(COR.branco) }, COR.azulEscuro);
  const resumo: Array<[string, string, string, number | null | string, string]> = [
    ["A6", "Menor Valor:", `IF(COUNT(${AA})=0,"",MIN(${AA}))`, e.menor, FORMATO.precoUnitario],
    ["A7", "Maior Valor:", `IF(COUNT(${AA})=0,"",MAX(${AA}))`, e.maior, FORMATO.precoUnitario],
    ["A8", "Média:", `IF(COUNT(${AA})=0,"",AVERAGE(${AA}))`, e.media, FORMATO.precoUnitario],
    ["A9", "Mediana:", `IF(COUNT(${AA})=0,"",MEDIAN(${AA}))`, e.mediana, FORMATO.precoUnitario],
  ];
  for (const [celula, rotulo, f, res, fmt] of resumo) {
    ws.getCell(celula).value = rotulo;
    estiloRotulo(ws.getCell(celula));
    const alvo = ws.getCell(`B${celula.slice(1)}`);
    formula(alvo, f, res, fmt);
    estiloValor(alvo, { horizontal: "center" });
  }
  const dispersao: Array<[string, string, string, number | null | string, string]> = [
    ["D6", "Desvio Padrão:", `IF(COUNT(${AA})<2,"",STDEV(${AA}))`, e.desvioPadrao, FORMATO.desvio],
    ["D7", "Coef. Variação:", 'IF(AND(ISNUMBER(E6),N(B8)>0),E6/B8,"")', e.coefVariacao === null ? "" : e.coefVariacao / 100, FORMATO.percentual],
    ["D8", "Nº Amostras:", `COUNT(${AA})`, e.n, FORMATO.inteiro],
  ];
  for (const [celula, rotulo, f, res, fmt] of dispersao) {
    ws.getCell(celula).value = rotulo;
    estiloRotulo(ws.getCell(celula));
    const alvo = ws.getCell(`E${celula.slice(1)}`);
    formula(alvo, f, res, fmt);
    estiloValor(alvo, { horizontal: "center" });
  }

  // Bloco por fonte (método do painel): H5:M…, sobre as auxiliares AC… de cada fonte.
  const colAuxiliar = new Map<string, number>(); // rótulo → coluna
  item.fontes.forEach((f, i) => colAuxiliar.set(f.rotulo, 29 + i));
  const k = item.fontes.length;
  const topo = k > 8 ? 2 : 5;
  faixaTitulo(ws, `H${topo}:M${topo}`, TITULO.porFonte, { size: 10, bold: true, color: argb(COR.branco) }, COR.azulEscuro);
  ["Fonte", "Inciso", "Nº", "Média", "Mediana", "Menor"].forEach((h, i) => {
    const cell = ws.getCell(topo + 1, 8 + i);
    cell.value = h;
    estiloCabecalho(cell, 9, COR.azulClaro, "000000");
  });
  let celulaMM: string | null = null;
  if (k === 0) {
    ws.mergeCells(topo + 2, 8, topo + 2, 13);
    valor(ws.getCell(topo + 2, 8), "Sem preço de mercado apurado nas fontes consultadas.");
    estiloValor(ws.getCell(topo + 2, 8));
  } else {
    item.fontes.forEach((f, i) => {
      const r = topo + 2 + i;
      const col = letra(colAuxiliar.get(f.rotulo) as number);
      const faixaFonte = faixa(col);
      valor(ws.getCell(r, 8), f.rotulo);
      valor(ws.getCell(r, 9), f.inciso);
      formula(ws.getCell(r, 10), `COUNT(${faixaFonte})`, f.estatisticas.n, FORMATO.inteiro);
      formula(ws.getCell(r, 11), `IF(J${r}=0,"",AVERAGE(${faixaFonte}))`, f.estatisticas.media, FORMATO.precoUnitario);
      formula(ws.getCell(r, 12), `IF(J${r}=0,"",MEDIAN(${faixaFonte}))`, f.estatisticas.mediana, FORMATO.precoUnitario);
      formula(ws.getCell(r, 13), `IF(J${r}=0,"",MIN(${faixaFonte}))`, f.estatisticas.menor, FORMATO.precoUnitario);
      for (let c = 8; c <= 13; c++) estiloValor(ws.getCell(r, c), { horizontal: c === 8 ? "left" : "center" });
    });
    const r = topo + 2 + k;
    const medianas = `L${topo + 2}:L${topo + 1 + k}`;
    valor(ws.getCell(r, 8), "Mediana das medianas");
    formula(ws.getCell(r, 10), `COUNT(${medianas})`, item.porFonte.n, FORMATO.inteiro);
    formula(ws.getCell(r, 11), `IF(J${r}=0,"",AVERAGE(${medianas}))`, item.porFonte.media, FORMATO.precoUnitario);
    formula(ws.getCell(r, 12), `IF(J${r}=0,"",MEDIAN(${medianas}))`, item.porFonte.mediana, FORMATO.precoUnitario);
    formula(ws.getCell(r, 13), `IF(J${r}=0,"",MIN(${medianas}))`, item.porFonte.menor, FORMATO.precoUnitario);
    for (let c = 8; c <= 13; c++) {
      const cell = ws.getCell(r, c);
      estiloValor(cell, { horizontal: c === 8 ? "left" : "center" });
      cell.font = { name: FONTE, size: 10, bold: true };
      cell.fill = preenchimento(COR.azulClaro);
    }
    celulaMM = `L${r}`;
  }

  // Preço adotado — fórmula do método do item, limitada ao teto (D12).
  faixaTitulo(ws, "A11:F11", TITULO.precoAdotado, { size: 11, bold: true, color: argb(COR.branco) }, COR.verde);
  const { expr, temPreco } = expressaoMetodo(item, celulaMM);
  ws.getCell("A12").value = "Preço Unitário:";
  formula(
    ws.getCell("B12"),
    `IF(${temPreco},IF(ISNUMBER(D12),MIN(${expr},D12),${expr}),IF(ISNUMBER(D12),D12,""))`,
    item.precoAdotado,
    FORMATO.precoUnitario
  );
  ws.getCell("C12").value = "Teto CMED (unid.):";
  if (item.teto && plano?.linhaTeto) {
    const fTeto =
      item.regraTeto === "pmvg_referencia"
        ? `${ref(ABA.cmed, `O${plano.linhaTeto}`)}`
        : `${ref(ABA.cmed, `K${plano.linhaTeto}`)}/${ref(ABA.cmed, `N${plano.linhaTeto}`)}`;
    formula(ws.getCell("D12"), fTeto, item.teto.valorUnitario, FORMATO.precoUnitario);
  } else {
    valor(ws.getCell("D12"), "sem PMVG vigente");
  }
  ws.getCell("E12").value = "Método:";
  valor(ws.getCell("F12"), item.descricaoMetodo);
  ws.getCell("A13").value = "Valor Total Estimado:";
  formula(ws.getCell("B13"), 'IF(ISNUMBER(B12),F3*B12,"")', item.valorTotal, FORMATO.moeda);
  ws.getCell("A14").value = "Justificativa:";
  ws.mergeCells("B14:F14");
  valor(ws.getCell("B14"), item.justificativa);
  for (let r = 12; r <= 14; r++) {
    for (let c = 1; c <= 6; c++) {
      const cell = ws.getCell(r, c);
      const ehRotulo = (c === 1 || ((c === 3 || c === 5) && r === 12)) && cell.value !== null;
      cell.font = { name: FONTE, size: 10, bold: ehRotulo };
      cell.fill = preenchimento(COR.verdeClaro);
      cell.border = BORDA;
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c === 2 && r === 14 ? "left" : ehRotulo ? "left" : "center" };
    }
  }
  ws.getCell("B14").alignment = { vertical: "top", horizontal: "left", wrapText: true };
  ws.getRow(14).height = Math.min(409, Math.max(ALTURA.justificativaItem, 13 * Math.ceil(item.justificativa.length / 95)));

  // Base de preços coletados
  faixaTitulo(ws, "A16:X16", TITULO.base, { size: 11, bold: true, color: argb(COR.branco) }, COR.azulEscuro);
  CABECALHO_BASE.forEach((h, i) => {
    const cell = ws.getCell(LINHA_CABECALHO_BASE, i + 1);
    cell.value = h;
    estiloCabecalho(cell, 8, COR.azulClaro, "000000");
  });
  const extras = [
    CABECALHO_PAINEL.motivo,
    CABECALHO_PAINEL.identificador,
    CABECALHO_PAINEL.precoConsiderado,
    CABECALHO_PAINEL.compoeFonte,
    ...item.fontes.map((f) => CABECALHO_PAINEL.auxiliarFonte(f.rotulo)),
  ];
  extras.forEach((h, i) => {
    const cell = ws.getCell(LINHA_CABECALHO_BASE, 25 + i);
    cell.value = h;
    estiloCabecalho(cell, 8, COR.cinzaPainel, "000000");
  });
  ws.getRow(LINHA_CABECALHO_BASE).height = ALTURA.cabecalhoBase;
  // Auxiliares agrupadas e recolhidas: o leitor vê o modelo da DLOG; quem
  // audita expande o grupo.
  for (let c = 27; c < 25 + extras.length; c++) {
    const col = ws.getColumn(c);
    col.width = 14;
    col.outlineLevel = 1;
    col.hidden = true;
  }
  ws.properties.outlineLevelCol = 1;

  item.linhas.forEach((l, i) => escreverLinhaBase(ws, PRIMEIRA_LINHA_BASE + i, item, l, colAuxiliar));
}

function escreverLinhaBase(ws: ExcelJS.Worksheet, r: number, item: MapaItem, l: LinhaBase, colAuxiliar: Map<string, number>) {
  const c = (col: number) => ws.getCell(r, col);
  valor(c(1), item.numero, "0");
  valor(c(2), l.rotulo);
  valor(c(3), l.numeroCompra);
  valor(c(4), dataUtc(l.dataCompra), FORMATO.data);
  valor(c(5), horaLocal(l.dataCotacao), FORMATO.dataHora);
  valor(c(6), l.anulada);
  valor(c(7), l.numeroItemCompra);
  valor(c(8), l.modalidade);
  valor(c(9), l.criterio);
  valor(c(10), l.codigoItem, "0");
  valor(c(11), l.descricao);
  valor(c(12), l.unidade);
  valor(c(13), l.quantidade, FORMATO.inteiro);
  valor(c(14), l.precoNominal, FORMATO.precoUnitario);
  valor(c(15), l.cnpjFornecedor);
  valor(c(16), l.fornecedor);
  valor(c(17), l.orgao);
  valor(c(18), l.uasg);
  valor(c(19), l.nomeUasg);
  if (l.referencia.url && /^https?:\/\//.test(l.referencia.url)) {
    c(20).value = { text: limparTexto(l.referencia.texto, 250), hyperlink: l.referencia.url };
  } else {
    valor(c(20), l.referencia.texto);
  }
  valor(c(21), l.compoe ? "Sim" : "Não");
  valor(c(22), dataUtc(l.mesReferencia), FORMATO.mesAno);
  if (item.ipcaLigado && l.ipcaAplicado) {
    formula(
      c(23),
      `IFERROR(INDEX(${ref(ABA.ipca, "$D:$D")},MATCH(V${r},${ref(ABA.ipca, "$A:$A")},0))-1,0)`,
      l.ipcaAcumulado,
      FORMATO.percentual
    );
  } else {
    valor(c(23), 0, FORMATO.percentual);
  }
  formula(c(24), `N${r}*(1+W${r})`, l.precoCorrigido, FORMATO.precoUnitario);
  valor(c(25), l.motivo);
  valor(c(26), l.identificador);
  formula(c(27), `IF(U${r}="Sim",X${r},"")`, l.compoe ? l.precoCorrigido : "", FORMATO.precoUnitario);
  valor(c(28), l.compoeFonte ? "Sim" : "Não");
  for (const [rotulo, col] of colAuxiliar) {
    const rotuloF = rotulo.replace(/"/g, '""');
    formula(
      c(col),
      `IF(AND(AB${r}="Sim",B${r}="${rotuloF}"),X${r},"")`,
      l.compoeFonte && l.rotulo === rotulo ? l.precoCorrigido : "",
      FORMATO.precoUnitario
    );
  }
  const ultimaCol = 28 + colAuxiliar.size;
  for (let col = 1; col <= ultimaCol; col++) {
    const cell = c(col);
    // Registro que não compõe fica em cinza: continua impresso (rastreabilidade
    // do descarte), mas não se confunde com os que formam o preço.
    cell.font =
      col === 20 && l.referencia.url
        ? { name: FONTE, size: 8, color: argb("0563C1"), underline: true }
        : l.compoe || col > 24
          ? { name: FONTE, size: 8 }
          : { name: FONTE, size: 8, color: argb(COR.cinza) };
    cell.alignment = { horizontal: col === 11 || col === 16 || col === 25 ? "left" : "center", vertical: "middle", wrapText: true };
    cell.border = BORDA;
  }
}

// ── Índices IPCA ─────────────────────────────────────────────────────────────

function abaIpca(wb: ExcelJS.Workbook, meta: MetaMapa) {
  const ws = wb.addWorksheet(ABA.ipca, { properties: { tabColor: argb(COR.abaIpca) } });
  larguras(ws, [14, 16, 16, 20, 22, 18]);
  faixaTitulo(ws, "A1:C1", TITULO.ipca, { size: 16, bold: true, color: argb(COR.azulEscuro) });
  faixaTitulo(
    ws,
    "A2:C2",
    `${TITULO.ipcaFonte} (SIDRA, tabela 1737).${meta.ipca.ligado && meta.ipca.mesBase ? ` Mês-base: ${meta.ipca.mesBase.slice(5, 7)}/${meta.ipca.mesBase.slice(0, 4)}. ${meta.ipca.convencao}` : ""}`,
    { size: 9, color: argb(COR.cinza) }
  );
  ws.getRow(2).height = 30;
  ws.mergeCells("E1:F1");
  linkInterno(ws.getCell("E1"), ABA.consolidacao, "◀ Voltar à Consolidação");

  if (!meta.ipca.ligado || !meta.ipca.indices.length) {
    faixaTitulo(ws, "A4:E4", "Atualização monetária não aplicada nesta pesquisa: os preços da base estão em valores nominais (coluna W = 0).", {
      size: 10,
      italic: true,
      color: argb(COR.cinza),
    });
  }
  CABECALHO_IPCA.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = h;
    estiloCabecalho(cell, 9);
  });
  ws.getRow(5).height = 30;
  if (!meta.ipca.ligado) return;

  const indices = meta.ipca.indices;
  const base = indices.findIndex((x) => x.competencia.slice(0, 7) === meta.ipca.mesBase);
  const linhaBase = base >= 0 ? 6 + base : null;
  indices.forEach((x, i) => {
    const r = 6 + i;
    valor(ws.getCell(r, 1), dataUtc(x.competencia), FORMATO.mesAno);
    valor(ws.getCell(r, 2), x.variacaoMensal === null ? null : x.variacaoMensal / 100, FORMATO.percentual);
    valor(ws.getCell(r, 3), x.numeroIndice, "0.00");
    const fator = linhaBase !== null ? indices[linhaBase - 6].numeroIndice / x.numeroIndice : null;
    if (linhaBase !== null) {
      formula(ws.getCell(r, 4), `C$${linhaBase}/C${r}`, fator, FORMATO.fator);
      formula(ws.getCell(r, 5), `D${r}-1`, fator === null ? null : fator - 1, FORMATO.percentual);
    }
    for (let c = 1; c <= 5; c++) estiloValor(ws.getCell(r, c), { horizontal: "center" });
  });
}

// ── CMED ─────────────────────────────────────────────────────────────────────

function abaCmed(wb: ExcelJS.Workbook, itens: MapaItem[], meta: MetaMapa, plano: Map<number, PlanoCmed>) {
  const ws = wb.addWorksheet(ABA.cmed);
  larguras(ws, LARGURA_CMED);
  ws.getCell("A1").value = TITULO.cmed;
  ws.getCell("A1").font = { name: FONTE, size: 16, bold: true };
  ws.getCell("A2").value = TITULO.cmedSub;
  ws.getCell("A2").font = { name: FONTE, size: 11, bold: true };
  ws.getCell("A3").value = meta.cmedLista
    ? `Lista CMED de ${meta.cmedLista} — a última publicada até a data de referência.`
    : meta.cmedPublicacao
      ? `Publicada em ${fmtDataCalendario(meta.cmedPublicacao)}.`
      : `Lista CMED vigente no painel${meta.cmedVigencia ? ` (vigência de ${fmtDataCalendario(meta.cmedVigencia)})` : ""}.`;
  ws.getCell("A3").font = { name: FONTE, size: 10, italic: true };

  for (const item of itens) {
    const p = plano.get(item.numero) as PlanoCmed;
    ws.mergeCells(p.inicio, 1, p.inicio, 2);
    const titulo = ws.getCell(p.inicio, 1);
    titulo.value = `ITEM ${item.numero}`;
    titulo.font = { name: FONTE, size: 14, bold: true };
    valor(ws.getCell(p.inicio, 3), item.medicamento);
    ws.getCell(p.inicio, 3).font = { name: FONTE, size: 10, italic: true, color: argb(COR.cinza) };

    const cab = p.inicio + 1;
    const cabecalhos = [
      ...CABECALHO_CMED,
      `PMVG ${item.aliquota} %`,
      "Unidades por embalagem (Qt_Embal)",
      `PMVG ${item.aliquota}% por unidade`,
      "Marcação",
    ];
    cabecalhos.forEach((h, i) => {
      const cell = ws.getCell(cab, i + 1);
      cell.value = h;
      estiloCabecalho(cell, 9, i >= 13 ? COR.cinzaPainel : COR.azulClaro, "000000");
    });
    ws.getRow(cab).height = ALTURA.cabecalhoCmed;

    if (!item.cmed.length) {
      ws.mergeCells(cab + 1, 1, cab + 1, 16);
      valor(ws.getCell(cab + 1, 1), "Sem registro com preço CMED vigente para o item na unidade de fornecimento pesquisada.");
      ws.getCell(cab + 1, 1).font = { name: FONTE, size: 10, italic: true };
      continue;
    }
    item.cmed.forEach((c, i) => {
      const r = cab + 1 + i;
      const v = [
        c.substancia,
        c.cnpj,
        c.laboratorio,
        c.registro,
        c.ean,
        c.produto,
        c.apresentacao,
        c.classeTerapeutica,
        c.tipoProduto,
        c.regimePreco,
      ];
      v.forEach((x, j) => valor(ws.getCell(r, j + 1), x));
      valor(ws.getCell(r, 11), c.pmvgSemImpostos, FORMATO.moeda);
      valor(ws.getCell(r, 12), c.pmvg0, FORMATO.moeda);
      valor(ws.getCell(r, 13), c.pmvgAliquota, FORMATO.moeda);
      valor(ws.getCell(r, 14), c.qtEmbalagem, "0");
      if (c.qtEmbalagem && c.pmvgAliquota !== null) {
        formula(ws.getCell(r, 15), `M${r}/N${r}`, c.unitarioAliquota, FORMATO.precoUnitario);
      } else {
        valor(ws.getCell(r, 15), null);
      }
      valor(ws.getCell(r, 16), c.marcacao);
      for (let col = 1; col <= 16; col++) {
        const cell = ws.getCell(r, col);
        cell.font = { name: FONTE, size: 9, bold: c.formaTeto };
        cell.alignment = { vertical: "middle", wrapText: true, horizontal: col >= 11 && col <= 15 ? "right" : "left" };
        cell.border = BORDA;
        if (c.formaTeto) cell.fill = preenchimento(COR.verdeClaro);
      }
    });
  }
}

// ── Parâmetros ───────────────────────────────────────────────────────────────

function abaParametros(wb: ExcelJS.Workbook, itens: MapaItem[], meta: MetaMapa) {
  const ws = wb.addWorksheet(ABA.parametros);
  larguras(ws, [34, 120]);
  faixaTitulo(ws, "A1:B1", "PARÂMETROS DA PESQUISA", { size: 14, bold: true, color: argb(COR.azulEscuro) });
  const linhas: Array<[string, string]> = [
    ["Processo SEI", meta.processo || "não informado"],
    ["Órgão / unidade", meta.orgao || "não informado"],
    ["Responsável pela pesquisa", [meta.responsavel, meta.cargo].filter(Boolean).join(" — ") || "não informado"],
    ["Gerado por", meta.usuario],
    ["Data e hora da geração", fmtDataHora(meta.geradoEm)],
    ["Data de referência", fmtData(meta.dataReferencia)],
    ["Período por fonte", meta.periodo],
    [
      "Atualização pelo IPCA",
      meta.ipca.ligado
        ? `${
            itens.every((i) => i.ipcaLigado || i.precoAdotado === null)
              ? "Ligada"
              : `Ligada em ${itens.filter((i) => i.ipcaLigado).length} de ${itens.length} itens (ver a linha de cada item)`
          } — mês-base ${meta.ipca.mesBase ? `${meta.ipca.mesBase.slice(5, 7)}/${meta.ipca.mesBase.slice(0, 4)}` : "—"}. ${meta.ipca.convencao}`
        : "Desligada — preços em valores nominais.",
    ],
    ...meta.fontesConsultadas.map((f, i): [string, string] => [i === 0 ? "Fontes consultadas" : "", f]),
    ["Versão dos dados (painel)", meta.versaoDados ?? "—"],
    ["Hash do conteúdo (SHA-256)", meta.hashConteudo],
    [
      "Integridade do arquivo",
      "O SHA-256 do arquivo gerado fica registrado no log de auditoria do painel (ação EXPORT) e no cabeçalho X-Arquivo-Sha256 da resposta.",
    ],
  ];
  for (const item of itens) {
    linhas.push([
      `${item.aba} — método e teto`,
      `${item.descricaoMetodo}; teto: ${item.descricaoTeto}${item.justificativaEditada ? "; justificativa editada pelo responsável" : ""}`,
    ]);
    linhas.push([`${item.aba} — período e IPCA`, item.descricaoPeriodo]);
    const filtros = meta.filtrosPorItem.get(item.numero);
    if (filtros) linhas.push([`${item.aba} — recorte`, filtros]);
  }
  linhas.forEach(([k, v], i) => {
    const r = 3 + i;
    valor(ws.getCell(r, 1), k);
    valor(ws.getCell(r, 2), v);
    ws.getCell(r, 1).font = { name: FONTE, size: 10, bold: true };
    ws.getCell(r, 2).font = { name: FONTE, size: 10 };
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(r, 1).alignment = { vertical: "top", wrapText: true };
  });
}

// ── Workbook ─────────────────────────────────────────────────────────────────

export async function gerarMapaDlog(itens: MapaItem[], meta: MetaMapa): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Painel DJUD";
  wb.created = meta.geradoEm;
  wb.modified = meta.geradoEm;
  wb.calcProperties.fullCalcOnLoad = true;

  const plano = planejarCmed(itens);
  abaConsolidacao(wb, itens, meta);
  abaMemoria(wb, itens);
  for (const item of itens) abaDoItem(wb, item, plano.get(item.numero));
  abaIpca(wb, meta);
  abaCmed(wb, itens, meta, plano);
  abaParametros(wb, itens, meta);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
