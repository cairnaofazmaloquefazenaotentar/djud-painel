#!/usr/bin/env node

/**
 * Script de Importação: Excel SIAFI → sismat.SiafiPagamento
 *
 * Lê o arquivo Excel de pagamentos SIAFI e importa para a tabela
 * sismat.SiafiPagamento. A chave de cruzamento com o Redmine é:
 *
 *   regexp_replace(d."numeroProcesso", '\D', '', 'g') = p."numeroProcesso"
 *
 * onde p."numeroProcesso" é armazenado com dígitos puros (ex: "00010967620184013000").
 *
 * Colunas usadas:
 *   "Nº Processo Judicial" → numeroProcesso (strip não-dígitos)
 *   "Valor OB"             → valorOB
 *   "Dt Pagto SIAFI"       → dtPagtoSiafi
 *   + campos contextuais
 *
 * Uso:
 *   npx tsx scripts/import-siafi-pagamentos.ts --dry-run --file="caminho/arquivo.xlsx"
 *   npx tsx scripts/import-siafi-pagamentos.ts --truncate --confirm --file="caminho/arquivo.xlsx"
 *   npx tsx scripts/import-siafi-pagamentos.ts --limit=100 --file="caminho/arquivo.xlsx"
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// ── Config ────────────────────────────────────────────────────────────────────

const FILE_ARG = process.argv.find((a: string) => a.startsWith("--file="))?.slice("--file=".length);
const XLSX_PATH = FILE_ARG || process.env.EXCEL_PATH || "";
const BATCH_SIZE = 1000;
const DRY_RUN = process.argv.includes("--dry-run");
const TRUNCATE = process.argv.includes("--truncate");
const CONFIRM = process.argv.includes("--confirm");
const LIMIT = parseInt(process.argv.find((a: string) => a.startsWith("--limit="))?.split("=")[1] || "0");

// ── Limpeza ───────────────────────────────────────────────────────────────────

/** Remove todos os caracteres não-numéricos (para chave de cruzamento). */
function apenasDigitos(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\D/g, "");
  return s || null;
}

/** Texto limpo; null para vazios e "N/A". */
function limpa(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let t = typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(v)) : String(v);
  t = t.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "n/a" || low === "na" || low === "-" || low === "none") return null;
  return t;
}

/** Número decimal; null para inválidos. */
function limpaDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Converte data do Excel para objeto Date.
 * Suporta: serial numérico Excel, string "DD/MM/YYYY".
 */
function limpaData(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    // Serial Excel: dias desde 1/1/1900 (com bug do 1900)
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    // Formato "DD/MM/YYYY"
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    // ISO
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return v;
  return null;
}

// ── Interface de linha ────────────────────────────────────────────────────────

interface PagamentoRow {
  numeroProcesso: string;
  valorOB: number;
  valorProcesso: number | null;
  dtPagtoSiafi: Date | null;
  ano: string | null;
  nomeAutor: string | null;
  nrOB: string | null;
  tipoTransferencia: string | null;
  assuntoGeral: string | null;
  uf: string | null;
  municipio: string | null;
  varaExecucao: string | null;
  trf: string | null;
  observacao: string | null;
}

// ── Leitura ───────────────────────────────────────────────────────────────────

function lerPagamentos(): PagamentoRow[] {
  if (!XLSX_PATH) {
    console.error('❌ Informe o arquivo: --file="caminho/arquivo.xlsx" (ou EXCEL_PATH).');
    process.exit(1);
  }
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${XLSX_PATH}`);
    process.exit(1);
  }

  console.log(`📄 Lendo ${path.basename(XLSX_PATH)}…`);
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  console.log(`   Planilha: "${sheetName}"`);
  const ws = wb.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  if (!rows.length) {
    console.error("❌ Planilha vazia.");
    process.exit(1);
  }

  // Resolve cabeçalhos (tolerante a espaços extras)
  const chaves = Object.keys(rows[0]);
  const resolve = (nome: string): string | null =>
    chaves.find((k) => k.trim() === nome.trim()) ?? null;

  const COL_PROCESSO    = resolve("Nº Processo Judicial");
  const COL_VALOR_OB    = resolve("Valor OB");
  const COL_VALOR_PROC  = resolve("Valor Processo");
  const COL_DT_PAGTO    = resolve("Dt Pagto SIAFI");
  const COL_ANO         = resolve("Ano");
  const COL_AUTOR       = resolve("Nome Pessoa (Autor)");
  const COL_NR_OB       = resolve("Nº OB");
  const COL_TIPO        = resolve("Tipo de Transferência");
  const COL_ASSUNTO     = resolve("Assunto Geral");
  const COL_UF          = resolve("UF");
  const COL_MUNICIPIO   = resolve("Município");
  const COL_VARA        = resolve("Vara Execução");
  const COL_TRF         = resolve("TRFs");
  const COL_OBS         = resolve("Observação");

  if (!COL_PROCESSO) {
    console.error(`❌ Coluna "Nº Processo Judicial" não encontrada. Colunas: ${chaves.join(", ")}`);
    process.exit(1);
  }
  if (!COL_VALOR_OB) {
    console.error(`❌ Coluna "Valor OB" não encontrada.`);
    process.exit(1);
  }

  const total = LIMIT ? Math.min(LIMIT, rows.length) : rows.length;
  const lista: PagamentoRow[] = [];
  let semProcesso = 0;
  let semValor = 0;

  for (let i = 0; i < total; i++) {
    const row = rows[i];

    const numeroProcesso = apenasDigitos(row[COL_PROCESSO]);
    if (!numeroProcesso) { semProcesso++; continue; }

    const valorOB = limpaDecimal(COL_VALOR_OB ? row[COL_VALOR_OB] : null);
    if (valorOB === null) { semValor++; continue; }

    lista.push({
      numeroProcesso,
      valorOB,
      valorProcesso: limpaDecimal(COL_VALOR_PROC ? row[COL_VALOR_PROC] : null),
      dtPagtoSiafi:  limpaData(COL_DT_PAGTO ? row[COL_DT_PAGTO] : null),
      ano:            limpa(COL_ANO       ? row[COL_ANO]       : null),
      nomeAutor:      limpa(COL_AUTOR     ? row[COL_AUTOR]     : null),
      nrOB:           limpa(COL_NR_OB     ? row[COL_NR_OB]     : null),
      tipoTransferencia: limpa(COL_TIPO   ? row[COL_TIPO]      : null),
      assuntoGeral:   limpa(COL_ASSUNTO   ? row[COL_ASSUNTO]   : null),
      uf:             limpa(COL_UF        ? row[COL_UF]        : null),
      municipio:      limpa(COL_MUNICIPIO ? row[COL_MUNICIPIO] : null),
      varaExecucao:   limpa(COL_VARA      ? row[COL_VARA]      : null),
      trf:            limpa(COL_TRF       ? row[COL_TRF]       : null),
      observacao:     limpa(COL_OBS       ? row[COL_OBS]       : null),
    });
  }

  // Resumo
  const processos = new Set(lista.map((r) => r.numeroProcesso));
  const valorTotal = lista.reduce((s, r) => s + r.valorOB, 0);
  const comData    = lista.filter((r) => r.dtPagtoSiafi).length;

  console.log("\n📊 Resumo do parsing:");
  console.log(`   Linhas lidas .............. ${total}`);
  console.log(`   Sem nº processo ........... ${semProcesso}`);
  console.log(`   Sem valor OB .............. ${semValor}`);
  console.log(`   Pagamentos válidos ......... ${lista.length}`);
  console.log(`   Processos distintos ........ ${processos.size}`);
  console.log(`   Com data pagamento ......... ${comData}`);
  console.log(`   Valor OB total ............. R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

  if (lista.length > 0) {
    const ex = lista[0];
    console.log("\n🔎 Amostra (1ª linha válida):");
    console.log(`   processo: ${ex.numeroProcesso} | valorOB: ${ex.valorOB} | data: ${ex.dtPagtoSiafi?.toISOString().slice(0,10)}`);
    console.log(`   autor: ${ex.nomeAutor} | uf: ${ex.uf} | trf: ${ex.trf}`);
  }

  return lista;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Importador SIAFI Pagamentos → sismat.SiafiPagamento");
  console.log(`🔧 Modo: ${DRY_RUN ? "DRY_RUN" : LIMIT ? `LIMIT ${LIMIT}` : "FULL"}${TRUNCATE ? " + TRUNCATE" : ""}\n`);

  const lista = lerPagamentos();

  if (DRY_RUN) {
    console.log("\n✅ DRY_RUN concluído — nenhum dado gravado.");
    return;
  }
  if (!LIMIT && !CONFIRM) {
    console.log(
      "\n⛔ Importação completa requer --confirm.\n" +
      '   Ex.: npx tsx scripts/import-siafi-pagamentos.ts --truncate --confirm --file="caminho/arquivo.xlsx"'
    );
    return;
  }

  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    if (TRUNCATE) {
      const res = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM sismat."SiafiPagamento"`
      );
      await db.$executeRawUnsafe(`DELETE FROM sismat."SiafiPagamento"`);
      console.log(`\n🧹 Tabela limpa (${res[0].count} registro(s) removido(s)).`);
    }
    console.log(`\n💾 Inserindo ${lista.length} registro(s) em lotes de ${BATCH_SIZE}…`);
    let inseridos = 0;
    for (let i = 0; i < lista.length; i += BATCH_SIZE) {
      const lote = lista.slice(i, i + BATCH_SIZE);
      // Monta INSERT em lote via SQL parametrizado
      for (const row of lote) {
        await db.$executeRawUnsafe(
          `INSERT INTO sismat."SiafiPagamento"
             (id, "numeroProcesso", "valorOB", "valorProcesso", "dtPagtoSiafi",
              ano, "nomeAutor", "nrOB", "tipoTransferencia", "assuntoGeral",
              uf, municipio, "varaExecucao", trf, observacao)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          row.numeroProcesso,
          row.valorOB,
          row.valorProcesso ?? null,
          row.dtPagtoSiafi ?? null,
          row.ano ?? null,
          row.nomeAutor ?? null,
          row.nrOB ?? null,
          row.tipoTransferencia ?? null,
          row.assuntoGeral ?? null,
          row.uf ?? null,
          row.municipio ?? null,
          row.varaExecucao ?? null,
          row.trf ?? null,
          row.observacao ?? null
        );
        inseridos++;
        if (inseridos % 500 === 0) process.stdout.write(`\r   ${inseridos}/${lista.length}`);
      }
    }
    process.stdout.write(`\r   ${inseridos}/${lista.length}`);
    console.log(`\n\n✅ Importação concluída: ${inseridos} pagamento(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
