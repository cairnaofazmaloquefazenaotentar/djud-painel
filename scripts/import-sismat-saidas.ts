#!/usr/bin/env node

/**
 * Script de Importação: Demanda_Judicial_-_Saidas.xlsx → schema "sismat" (tabela SismatSaida)
 *
 * Particularidades da base de SAÍDAS (diferentes do CSV de entradas!):
 *   • Formato XLSX (SheetJS/xlsx, já devDependency) — valores numéricos vêm NATIVOS
 *     do Excel (float), sem risco de locale. NÃO aplicar parsing pt-BR.
 *   • 3 colunas SEM cabeçalho (B = código BR/CATMAT do material; F = código do
 *     destinatário; I = sigla da UF) → mapeamento por ÍNDICE, não por nome.
 *   • Data em texto pt-BR mensal: "MAI 2025" (sem dia) → dtBaixa = 1º dia do mês (UTC).
 *   • Material SEM código prefixo ("ABEMACICLIBE  50MG - COMPRIMIDO"); a normalização
 *     usa a MESMA regra das entradas (remove prefixo se houver + corta na dosagem)
 *     para que materialNome seja chave de cruzamento entre as duas bases.
 *
 * Importa TODAS as linhas cruas (Aquisição + Devolução). O recorte de "saídas
 * efetivas" (Programa Saúde = Aquisição) é aplicado na camada de consulta.
 *
 * Uso:
 *   npx tsx scripts/import-sismat-saidas.ts --dry-run
 *   npx tsx scripts/import-sismat-saidas.ts --limit=100
 *   npx tsx scripts/import-sismat-saidas.ts --truncate --confirm
 *   npx tsx scripts/import-sismat-saidas.ts --file=/caminho/Demanda_Judicial_-_Saidas.xlsx
 *
 * Fonte do arquivo: --file=... > env SISMAT_SAIDAS_XLSX > ./Demanda_Judicial_-_Saidas.xlsx
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

// ── Flags / config ──────────────────────────────────────────────────────────

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");
const TRUNCATE = process.argv.includes("--truncate");
const LIMIT = parseInt(arg("limit") || "0", 10);
const BATCH_SIZE = 500;

const XLSX_PATH =
  arg("file") ||
  process.env.SISMAT_SAIDAS_XLSX ||
  path.join(process.cwd(), "Demanda_Judicial_-_Saidas.xlsx");

/** Recorte de "saída efetiva" — apenas para o resumo do dry-run (o filtro real vive nas métricas). */
const PROG_AQUISICAO = "DEMANDA JUDICIAL - Aquisição";

// ── Índices de coluna (a planilha tem 3 colunas SEM cabeçalho) ───────────────

const COL = {
  material: 0,
  materialCodigo: 1, // sem cabeçalho (ex: "BR0345240")
  progSaude: 2,
  fornecedor: 3,
  destinatario: 4,
  destinatarioCodigo: 5, // sem cabeçalho (numérico)
  esfera: 6,
  ufNome: 7,
  uf: 8, // sem cabeçalho (sigla; "NI" = não informado)
  tipoDestinatario: 9,
  mesAnoBaixa: 10,
  qtdEntregue: 11,
  qtdPedido: 12,
  valorItem: 13,
  valorTotal: 14,
} as const;

// ── Utilitários de parsing ───────────────────────────────────────────────────

function sanitizeStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\u200b/g, "").trim();
  return s || null;
}

/** Número nativo do Excel (ou string com ponto decimal). NÃO aplica locale pt-BR. */
function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const s = String(value).trim();
  if (!s || s.includes(",")) return null; // vírgula não é esperada — descarta por segurança
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const MESES_PT: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

/** "MAI 2025" → Date(2025-05-01 UTC). Formato inesperado → null. */
function parseMesAnoPT(value: unknown): Date | null {
  const s = sanitizeStr(value);
  if (!s) return null;
  const m = s.toUpperCase().match(/^([A-ZÇ]{3})[A-ZÇ]*\s*\/?\s*(\d{4})$/);
  if (!m) return null;
  const mes = MESES_PT[m[1]];
  if (!mes) return null;
  return new Date(Date.UTC(Number(m[2]), mes - 1, 1));
}

/**
 * Normalização de material — MESMA regra das entradas (import-sismat-entradas.ts),
 * garantindo que materialNome cruze entre as duas bases:
 *   (1) remove "código - " inicial se houver (nas saídas normalmente não há);
 *   (2) corta no primeiro token de dosagem (espaço seguido de dígito).
 *   "ABEMACICLIBE  50MG - COMPRIMIDO" → "ABEMACICLIBE"
 */
function normalizeMaterial(raw: string): string {
  let s = raw.replace(/^\s*\d+\s*-\s*/, "");
  const m = s.match(/\s\d/);
  if (m && m.index !== undefined) s = s.slice(0, m.index);
  s = s.trim();
  return s || raw.trim();
}

// ── Leitura + mapeamento ─────────────────────────────────────────────────────

interface SaidaRow {
  material: string;
  materialCodigo: string | null;
  materialNome: string | null;
  progSaude: string | null;
  fornecedor: string | null;
  destinatario: string | null;
  destinatarioCodigo: string | null;
  esfera: string | null;
  ufNome: string | null;
  uf: string | null;
  tipoDestinatario: string | null;
  mesAnoBaixa: string | null;
  dtBaixa: Date | null;
  qtdEntregue: number | null;
  qtdPedido: number | null;
  valorItem: number | null;
  valorTotal: number | null;
}

function readRows(): SaidaRow[] {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${XLSX_PATH}`);
    console.error(`   Use --file=/caminho/arquivo.xlsx ou defina SISMAT_SAIDAS_XLSX.`);
    process.exit(1);
  }

  console.log("📖 Lendo XLSX...");
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 → arrays crus (necessário: a planilha tem colunas sem cabeçalho)
  const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  if (table.length < 2) {
    console.error("❌ Planilha vazia ou sem linhas de dados.");
    process.exit(1);
  }

  // Sanidade do cabeçalho: as colunas NOMEADAS devem estar onde esperamos
  const header = (table[0] || []).map((h) => (h == null ? "" : String(h).trim()));
  const esperado: Array<[number, string]> = [
    [COL.material, "Material"],
    [COL.progSaude, "Programa Saúde"],
    [COL.fornecedor, "Fornecedor"],
    [COL.mesAnoBaixa, "Mês e Ano Baixa"],
    [COL.valorTotal, "Valor Total Saída"],
  ];
  const divergentes = esperado.filter(([i, nome]) => header[i] !== nome);
  if (divergentes.length > 0) {
    console.error("❌ Layout do XLSX diferente do esperado:");
    divergentes.forEach(([i, nome]) =>
      console.error(`   coluna ${i}: esperado "${nome}", encontrado "${header[i] ?? ""}"`)
    );
    console.error("   Verifique se o export do SISMAT mudou de estrutura.");
    process.exit(1);
  }

  const out: SaidaRow[] = [];
  let ignoradas = 0;
  for (let r = 1; r < table.length; r++) {
    const c = table[r] || [];
    const materialRaw = sanitizeStr(c[COL.material]);
    if (!materialRaw) {
      ignoradas++;
      continue;
    }
    const mesAno = sanitizeStr(c[COL.mesAnoBaixa]);
    out.push({
      material: materialRaw,
      materialCodigo: sanitizeStr(c[COL.materialCodigo]),
      materialNome: normalizeMaterial(materialRaw),
      progSaude: sanitizeStr(c[COL.progSaude]),
      fornecedor: sanitizeStr(c[COL.fornecedor]),
      destinatario: sanitizeStr(c[COL.destinatario]),
      destinatarioCodigo: sanitizeStr(c[COL.destinatarioCodigo]),
      esfera: sanitizeStr(c[COL.esfera]),
      ufNome: sanitizeStr(c[COL.ufNome]),
      uf: sanitizeStr(c[COL.uf]),
      tipoDestinatario: sanitizeStr(c[COL.tipoDestinatario]),
      mesAnoBaixa: mesAno,
      dtBaixa: parseMesAnoPT(mesAno),
      qtdEntregue: toNum(c[COL.qtdEntregue]),
      qtdPedido: toNum(c[COL.qtdPedido]),
      valorItem: toNum(c[COL.valorItem]),
      valorTotal: toNum(c[COL.valorTotal]),
    });
    if (LIMIT && out.length >= LIMIT) break;
  }
  if (ignoradas) console.log(`⚠️  ${ignoradas} linha(s) ignorada(s) por Material vazio.`);
  return out;
}

function resumo(rows: SaidaRow[]) {
  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const distintos = (key: keyof SaidaRow) => new Set(rows.map((r) => r[key]).filter(Boolean)).size;

  const soma = (pred: (r: SaidaRow) => boolean) =>
    rows.reduce((s, r) => s + (pred(r) ? r.valorTotal ?? 0 : 0), 0);

  const aquisicao = rows.filter((r) => r.progSaude === PROG_AQUISICAO);
  const comData = rows.filter((r) => r.dtBaixa).length;

  console.log("\n📊 Resumo do parsing:");
  console.log(`   Linhas válidas ............ ${rows.length}`);
  console.log(`   Materiais (normalizados) .. ${distintos("materialNome")}`);
  console.log(`   Fornecedores distintos .... ${distintos("fornecedor")}`);
  console.log(`   UFs distintas ............. ${distintos("uf")}`);
  console.log(`   Tipos de destinatário ..... ${distintos("tipoDestinatario")}`);
  console.log(`   Com data de baixa ......... ${comData}`);
  console.log(`   Valor Total (bruto) ....... ${brl(soma(() => true))}`);
  console.log(`   Valor Total (Aquisição) ... ${brl(soma((r) => r.progSaude === PROG_AQUISICAO))}  ← saídas efetivas (${aquisicao.length} linhas)`);
  console.log(`   Valor Total (Devolução) ... ${brl(soma((r) => r.progSaude !== PROG_AQUISICAO))}`);
  const a = rows[0];
  if (a) {
    console.log("\n🔎 Amostra (1ª linha):");
    console.log(`   material: ${a.material}`);
    console.log(`   materialNome: ${a.materialNome} | codigo: ${a.materialCodigo}`);
    console.log(`   mesAnoBaixa: ${a.mesAnoBaixa} → dtBaixa: ${a.dtBaixa?.toISOString().slice(0, 10)}`);
    console.log(`   uf: ${a.uf} | tipoDestinatario: ${a.tipoDestinatario}`);
    console.log(`   valorItem: ${a.valorItem} | valorTotal: ${a.valorTotal}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Importador SISMAT (Saídas) → schema sismat.SismatSaida");
  console.log(`📄 Arquivo: ${XLSX_PATH}`);
  console.log(
    `🔧 Modo: ${DRY_RUN ? "DRY_RUN" : LIMIT ? `LIMIT ${LIMIT}` : "FULL"}${TRUNCATE ? " + TRUNCATE" : ""}\n`
  );

  const rows = readRows();
  resumo(rows);

  if (DRY_RUN) {
    console.log("\n✅ DRY_RUN concluído — nenhum dado gravado.");
    return;
  }

  if (!LIMIT && !CONFIRM) {
    console.log(
      "\n⛔ Importação completa requer --confirm (ou use --limit=N para testar).\n" +
        "   Ex.: npx tsx scripts/import-sismat-saidas.ts --truncate --confirm"
    );
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ log: ["error"] });

  try {
    if (TRUNCATE) {
      console.log("\n🧹 Limpando tabela sismat.SismatSaida...");
      const del = await db.sismatSaida.deleteMany({});
      console.log(`   ${del.count} registro(s) removido(s).`);
    }

    console.log(`\n💾 Inserindo ${rows.length} registro(s) em lotes de ${BATCH_SIZE}...`);
    let inseridos = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const lote = rows.slice(i, i + BATCH_SIZE);
      const res = await db.sismatSaida.createMany({ data: lote });
      inseridos += res.count;
      process.stdout.write(`\r   ${inseridos}/${rows.length}`);
    }
    console.log(`\n✅ Importação concluída: ${inseridos} registro(s).`);
  } catch (err) {
    console.error("\n❌ Erro na importação:", err);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
