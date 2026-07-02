#!/usr/bin/env node

/**
 * Script de Importação: SISMAT_entradas.csv → schema Postgres "sismat" (tabela SismatEntrada)
 *
 * Particularidades da base SISMAT (diferentes da base Redmine!):
 *   • Encoding ISO-8859-1 (Latin-1), NÃO UTF-8.
 *   • Separador ";" (padrão brasileiro), com campos entre aspas que podem conter ";"
 *     (ex.: a entidade HTML "&#8203;" contém ";") — por isso usamos um parser CSV
 *     que respeita aspas, não um split ingênuo.
 *   • Datas em ISO "YYYY-MM-DD" (não ambíguas) → new Date() direto.
 *   • Decimais em FORMATO INGLÊS (ponto decimal: "312.27", "3379933.72", "1e-05")
 *     → parseFloat direto. NÃO aplicar parsing brasileiro (que trataria "." como
 *     separador de milhar e destruiria os valores). Exibição em pt-BR (R$) fica na UI.
 *
 * Importa TODAS as movimentações cruas (espelho fiel). O recorte de "gastos"
 * (apenas aquisições) é aplicado na camada de consulta (lib/sismat-metrics.ts).
 *
 * Uso:
 *   npx tsx scripts/import-sismat-entradas.ts --dry-run                 (valida parsing; não toca o BD)
 *   npx tsx scripts/import-sismat-entradas.ts --limit=100               (importa 100 linhas)
 *   npx tsx scripts/import-sismat-entradas.ts --truncate --confirm      (limpa a tabela e importa tudo)
 *   npx tsx scripts/import-sismat-entradas.ts --file=/caminho/arq.csv   (arquivo específico)
 *
 * Fonte do arquivo (ordem de precedência): --file=... > env SISMAT_CSV > ./SISMAT_entradas.csv
 */

import * as fs from "fs";
import * as path from "path";

// ── Flags / config ──────────────────────────────────────────────────────────

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");
const TRUNCATE = process.argv.includes("--truncate");
const LIMIT = parseInt(arg("limit") || "0", 10);
const BATCH_SIZE = 500;

const CSV_PATH =
  arg("file") ||
  process.env.SISMAT_CSV ||
  path.join(process.cwd(), "SISMAT_entradas.csv");

// Tipos de movimentação considerados "aquisição" — apenas para o resumo do dry-run.
// (O filtro efetivo de gastos vive em lib/sismat-metrics.ts.)
const TIPOS_AQUISICAO = new Set(["ENTRADA ORÇAMENTÁRIA", "EXTRA-ORÇ. / AQUISIÇÃO"]);

// ── Parser CSV mínimo (RFC-4180-like), respeita aspas e ";" embutido ─────────

function parseCSV(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignora CR (arquivos com CRLF); \n encerra a linha
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── Utilitários de parsing (formato da base SISMAT) ──────────────────────────

function sanitizeStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value)
    .replace(/&#8203;?/g, "") // zero-width space (entidade HTML que suja alguns campos)
    .replace(/\u200b/g, "")
    .trim();
  return s || null;
}

/** Data ISO "YYYY-MM-DD" → Date (UTC). Texto inválido (ex.: "DEVOLUÇÃO DJ") → null. */
function parseDateISO(value: unknown): Date | null {
  const s = sanitizeStr(value);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Decimal em FORMATO INGLÊS: ponto decimal, sem separador de milhar.
 * Aceita "312.27", "3379933.72", "1e-05", "0.0". Vírgula não é esperada nesta base;
 * se aparecer, o valor é descartado (null) para não gerar número truncado silenciosamente.
 */
function parseFloatEN(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const s = String(value).trim();
  if (s === "") return null;
  if (s.includes(",")) return null; // não é formato inglês — descarta por segurança
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseIntEN(value: unknown): number | null {
  const s = sanitizeStr(value);
  if (!s) return null;
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

/**
 * Normaliza o Material bruto do SISMAT para o nome do princípio ativo/produto,
 * replicando o comportamento do dashboard original:
 *   "0767689 - ELTROMBOPAG OLAMINA 50 MG / REVOLADE" → "ELTROMBOPAG OLAMINA"
 *   "0705250 - BETA-AGALSIDASE 35 MG - PÓ LIÓFILO"    → "BETA-AGALSIDASE"
 *   "0736864 - ACESSÓRIO BOMBA INSULINA - RESERVATÓRIO" (sem dosagem) → mantém
 * Passos: (1) remove "código - " inicial; (2) corta no primeiro token de dosagem
 * (espaço seguido de dígito).
 */
function normalizeMaterial(raw: string): string {
  let s = raw.replace(/^\s*\d+\s*-\s*/, "");
  const m = s.match(/\s\d/);
  if (m && m.index !== undefined) s = s.slice(0, m.index);
  s = s.trim();
  return s || raw.trim();
}

// ── Índices de coluna (por nome do cabeçalho) ────────────────────────────────

const COLS = [
  "SIAFI",
  "Material",
  "Dt. Armaz.",
  "Dt. Validade",
  "Prog Saúde",
  "Unid",
  "Quantidade",
  "Valor Unitário",
  "Valor Total",
  "N Lote",
  "Fornecedor",
  "Contrato",
  "Empenho/Doc",
  "Dt. Recebimento",
  "Nota Fiscal/Doc",
  "Status Armazenamento",
  "Nº de Ordem",
  "Distribuidor",
  "Fabricante",
  "Tipo de Movimentação",
] as const;

interface SismatRow {
  siafi: number | null;
  material: string;
  materialNome: string | null;
  dtArmazenamento: Date | null;
  dtValidade: Date | null;
  progSaude: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  nLote: string | null;
  fornecedor: string | null;
  contrato: string | null;
  empenhoDoc: string | null;
  dtRecebimento: Date | null;
  notaFiscalDoc: string | null;
  statusArmazenamento: string | null;
  numeroOrdem: string | null;
  distribuidor: string | null;
  fabricante: string | null;
  tipoMovimentacao: string | null;
}

function mapRow(cells: string[], idx: Record<string, number>): SismatRow | null {
  const g = (name: string): string => cells[idx[name]] ?? "";
  const materialRaw = sanitizeStr(g("Material"));
  if (!materialRaw) return null; // Material é obrigatório

  return {
    siafi: parseIntEN(g("SIAFI")),
    material: materialRaw,
    materialNome: normalizeMaterial(materialRaw),
    dtArmazenamento: parseDateISO(g("Dt. Armaz.")),
    dtValidade: parseDateISO(g("Dt. Validade")),
    progSaude: sanitizeStr(g("Prog Saúde")),
    unidade: sanitizeStr(g("Unid")),
    quantidade: parseFloatEN(g("Quantidade")),
    valorUnitario: parseFloatEN(g("Valor Unitário")),
    valorTotal: parseFloatEN(g("Valor Total")),
    nLote: sanitizeStr(g("N Lote")),
    fornecedor: sanitizeStr(g("Fornecedor")),
    contrato: sanitizeStr(g("Contrato")),
    empenhoDoc: sanitizeStr(g("Empenho/Doc")),
    dtRecebimento: parseDateISO(g("Dt. Recebimento")),
    notaFiscalDoc: sanitizeStr(g("Nota Fiscal/Doc")),
    statusArmazenamento: sanitizeStr(g("Status Armazenamento")),
    numeroOrdem: sanitizeStr(g("Nº de Ordem")),
    distribuidor: sanitizeStr(g("Distribuidor")),
    fabricante: sanitizeStr(g("Fabricante")),
    tipoMovimentacao: sanitizeStr(g("Tipo de Movimentação")),
  };
}

// ── Leitura + parsing do arquivo ─────────────────────────────────────────────

function readRows(): SismatRow[] {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${CSV_PATH}`);
    console.error(`   Use --file=/caminho/SISMAT_entradas.csv ou defina SISMAT_CSV.`);
    process.exit(1);
  }

  console.log("📖 Lendo CSV (decodificando ISO-8859-1 → UTF-8)...");
  const buf = fs.readFileSync(CSV_PATH);
  const text = new TextDecoder("latin1").decode(buf); // ISO-8859-1
  const table = parseCSV(text, ";");

  if (table.length < 2) {
    console.error("❌ CSV vazio ou sem linhas de dados.");
    process.exit(1);
  }

  const header = table[0].map((h) => h.trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => (idx[h] = i));

  const faltando = COLS.filter((c) => !(c in idx));
  if (faltando.length > 0) {
    console.error(`❌ Colunas ausentes no cabeçalho: ${faltando.join(", ")}`);
    console.error(`   Cabeçalho encontrado: ${header.join(" | ")}`);
    process.exit(1);
  }

  const out: SismatRow[] = [];
  let ignoradas = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.length === 1 && cells[0].trim() === "") continue; // linha em branco
    const mapped = mapRow(cells, idx);
    if (!mapped) {
      ignoradas++;
      continue;
    }
    out.push(mapped);
    if (LIMIT && out.length >= LIMIT) break;
  }
  if (ignoradas) console.log(`⚠️  ${ignoradas} linha(s) ignorada(s) por Material vazio.`);
  return out;
}

function resumo(rows: SismatRow[]) {
  const soma = (pred: (r: SismatRow) => boolean) =>
    rows.reduce((s, r) => s + (pred(r) ? r.valorTotal ?? 0 : 0), 0);
  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const distintos = (key: keyof SismatRow) =>
    new Set(rows.map((r) => r[key]).filter(Boolean)).size;

  const comData = rows.filter((r) => r.dtRecebimento).length;
  const somaTotal = soma(() => true);
  const somaAq = soma((r) => r.tipoMovimentacao != null && TIPOS_AQUISICAO.has(r.tipoMovimentacao));

  console.log("\n📊 Resumo do parsing:");
  console.log(`   Linhas válidas ............ ${rows.length}`);
  console.log(`   Fornecedores distintos .... ${distintos("fornecedor")}`);
  console.log(`   Fabricantes distintos ..... ${distintos("fabricante")}`);
  console.log(`   Distribuidores distintos .. ${distintos("distribuidor")}`);
  console.log(`   Materiais (normalizados) .. ${distintos("materialNome")}`);
  console.log(`   Com Dt. Recebimento ....... ${comData}`);
  console.log(`   Valor Total (bruto) ....... ${brl(somaTotal)}`);
  console.log(`   Valor Total (aquisições) .. ${brl(somaAq)}  ← base do dashboard de gastos`);
  const amostra = rows[0];
  if (amostra) {
    console.log("\n🔎 Amostra (1ª linha):");
    console.log(`   material: ${amostra.material}`);
    console.log(`   materialNome: ${amostra.materialNome}`);
    console.log(`   dtRecebimento: ${amostra.dtRecebimento?.toISOString().slice(0, 10)}`);
    console.log(`   valorUnitario: ${amostra.valorUnitario} | valorTotal: ${amostra.valorTotal}`);
    console.log(`   fornecedor: ${amostra.fornecedor} | fabricante: ${amostra.fabricante}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Importador SISMAT → schema sismat.SismatEntrada");
  console.log(`📄 Arquivo: ${CSV_PATH}`);
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
        "   Ex.: npx tsx scripts/import-sismat-entradas.ts --truncate --confirm"
    );
    return;
  }

  // Instanciação preguiçosa do Prisma (evita carregar engine no dry-run)
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ log: ["error"] });

  try {
    if (TRUNCATE) {
      console.log("\n🧹 Limpando tabela sismat.SismatEntrada...");
      const del = await db.sismatEntrada.deleteMany({});
      console.log(`   ${del.count} registro(s) removido(s).`);
    }

    console.log(`\n💾 Inserindo ${rows.length} registro(s) em lotes de ${BATCH_SIZE}...`);
    let inseridos = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const lote = rows.slice(i, i + BATCH_SIZE);
      const res = await db.sismatEntrada.createMany({ data: lote });
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
