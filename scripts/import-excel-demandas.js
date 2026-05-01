/**
 * Script de Importação: Base Redmine Excel → Banco de Dados DJUD
 *
 * Uso:
 *   node scripts/import-excel-demandas.js --dry-run
 *   node scripts/import-excel-demandas.js --limit 100
 *   node scripts/import-excel-demandas.js --confirm
 *   node scripts/import-excel-demandas.js --from-line 25000 --confirm
 */

const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const db = new PrismaClient();

const EXCEL_FILE = path.join(
  "C:\\Users\\Avell\\OneDrive\\Documentos\\DOUTORADO\\Possíveis Artigos para publicação - depois do ENMC com o profs Marcelo e Gentil\\Artigo_Judicialização_PNCP\\Base_Locoust5000\\baseRedmine_17-03-2026.xlsx"
);

const BATCH_SIZE = 500;

// ─── Parsing de argumentos CLI ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, confirm: false, limit: null, fromLine: 0 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") opts.dryRun = true;
    if (args[i] === "--confirm") opts.confirm = true;
    if (args[i] === "--limit") opts.limit = parseInt(args[i + 1]);
    if (args[i] === "--from-line") opts.fromLine = parseInt(args[i + 1]);
  }
  return opts;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────
function parseTrfRegiao(valor) {
  if (!valor) return null;
  const str = String(valor).trim();
  const match = str.match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function parseDate(valor) {
  if (!valor) return null;
  try {
    if (valor instanceof Date) return valor;
    if (typeof valor === "number") {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(valor);
      if (d) return new Date(d.y, d.m - 1, d.d);
      return null;
    }
    const str = String(valor).trim();
    if (!str || str === "N/A" || str === "n/a" || str === "-") return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function cleanString(valor) {
  if (!valor) return null;
  const str = String(valor).trim();
  if (!str || str === "N/A" || str === "n/a" || str === "-") return null;
  return str;
}

function mapPrioridade(valor) {
  const v = cleanString(valor);
  if (!v) return "Media";
  const map = {
    alta: "Alta",
    alta2: "Alta",
    média: "Media",
    media: "Media",
    baixa: "Baixa",
    normal: "Media",
    urgente: "Alta",
    imediata: "Alta",
    crítica: "Critica",
    critica: "Critica",
  };
  return map[v.toLowerCase()] || "Media";
}

function gerarNumero(row) {
  return `DJUD-${String(row.id).padStart(6, "0")}`;
}

// ─── Mapeamento Excel → Demanda ───────────────────────────────────────────────
function mapRowToDemanda(row, sistemUserId) {
  return {
    numero: gerarNumero(row),
    titulo: cleanString(row["subject"]) || `Demanda ${row["id"]}`,
    descricao: cleanString(row["Objeto da Ação"]) || cleanString(row["subject"]) || "Sem descrição",
    status: cleanString(row["status"]) || "Em Análise",
    prioridade: mapPrioridade(row["priority"]),
    pontoControle: cleanString(row["Ponto de Controle"]),
    trfRegiao: parseTrfRegiao(row["TRF Região"]),
    // Novos campos Sprint 8
    numeroExterno: String(row["id"]),
    areaTematica: cleanString(row["Grupo Temático"]),
    regiaoBrasil: cleanString(row["Região Brasil"]),
    objetoAcao: cleanString(row["Objeto da Ação"]),
    principioAtivo: cleanString(row["Princípio_Ativo"]),
    numeroProcesso: cleanString(row["Ação Judicial Originário"]),
    dataEntradaDJUD: parseDate(row["Data de Entrada_DJUD"]),
    // Campos adicionais já no banco
    ufResidencia: cleanString(row["UF_Residência "]) || cleanString(row["UF_Residencia"]),
    tipoRepresentacaoJudicial: cleanString(row["Tipo Representação Judicial"]),
    ano: row["Ano Ação Judicial"] ? parseInt(row["Ano Ação Judicial"]) : null,
    criadoEm: parseDate(row["created_on"]) || new Date(),
    atualizadoEm: parseDate(row["updated_on"]) || new Date(),
    criadoPorId: sistemUserId,
  };
}

// ─── Criar ou obter usuário SISTEMA ──────────────────────────────────────────
async function getOrCreateSistemaUser() {
  const existing = await db.user.findFirst({
    where: { email: "sistema@djud.internal" },
  });
  if (existing) return existing.id;

  const user = await db.user.create({
    data: {
      name: "SISTEMA (Importação Redmine)",
      email: "sistema@djud.internal",
      role: "ADMIN",
    },
  });
  console.log(`✅ Usuário SISTEMA criado: ${user.id}`);
  return user.id;
}

// ─── Registrar DataSource ─────────────────────────────────────────────────────
async function registrarDataSource(fileName, rowCount, sistemUserId, sha256) {
  try {
    await db.dataSource.create({
      data: {
        fileName,
        rowCount,
        importedByUserId: sistemUserId,
        sha256,
        status: "ACTIVE",
        schemaVersion: "1.0",
      },
    });
    console.log(`📦 DataSource registrado: ${fileName} (${rowCount} registros)`);
  } catch (err) {
    if (err.code === "P2002") {
      console.log(`ℹ️  DataSource já registrado (SHA256 duplicado). Continuando...`);
    } else {
      throw err;
    }
  }
}

// ─── Barra de progresso ──────────────────────────────────────────────────────
function progressBar(current, total) {
  const pct = Math.floor((current / total) * 100);
  const filled = Math.floor(pct / 2);
  const bar = "█".repeat(filled) + "░".repeat(50 - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total})`);
}

// ─── Import principal ─────────────────────────────────────────────────────────
async function importarDemandas(opts) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║   DJUD - Importação Base Redmine Excel           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (opts.dryRun) console.log("📋 MODO DRY-RUN: Nenhum dado será salvo\n");
  if (opts.fromLine > 0) console.log(`⏩ Retomando da linha: ${opts.fromLine}\n`);
  if (opts.limit) console.log(`🔢 Limite: primeiras ${opts.limit} linhas\n`);

  // 1. Leitura do Excel
  console.log(`📂 Lendo arquivo: ${path.basename(EXCEL_FILE)}...`);
  let workbook;
  try {
    workbook = XLSX.readFile(EXCEL_FILE, { cellDates: false });
  } catch (err) {
    console.error(`❌ Erro ao ler Excel: ${err.message}`);
    process.exit(1);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  let allRows = XLSX.utils.sheet_to_json(worksheet);

  console.log(`✅ Arquivo lido! Total de linhas: ${allRows.length.toLocaleString()}`);
  console.log(`📊 Planilha: "${sheetName}"`);

  // Calcula SHA256 para DataSource
  const sha256 = crypto
    .createHash("sha256")
    .update(JSON.stringify(allRows.slice(0, 100)))
    .digest("hex");

  // Aplicar fromLine e limit
  let rows = allRows;
  if (opts.fromLine > 0) rows = allRows.slice(opts.fromLine);
  if (opts.limit) rows = rows.slice(0, opts.limit);

  console.log(`\n📋 Registros a processar: ${rows.length.toLocaleString()}`);

  if (opts.dryRun) {
    console.log("\n🔍 Amostra do mapeamento (primeiras 3 linhas):");
    const sistemUserId = "dry-run-user";
    rows.slice(0, 3).forEach((row, i) => {
      const mapped = mapRowToDemanda(row, sistemUserId);
      console.log(`\n  --- Linha ${i + 1} ---`);
      Object.entries(mapped)
        .filter(([, v]) => v !== null && v !== undefined)
        .forEach(([k, v]) => console.log(`    ${k}: ${v}`));
    });
    console.log("\n✅ Dry-run completo. Nenhum dado foi salvo.");
    console.log("   Execute com --confirm para importar.");
    return;
  }

  if (!opts.confirm) {
    console.log("\n⚠️  Execute com --confirm para importar os dados.");
    return;
  }

  // 2. Obter usuário SISTEMA
  const sistemUserId = await getOrCreateSistemaUser();

  // 3. Buscar IDs já importados para evitar duplicatas
  console.log("\n🔍 Verificando duplicatas no banco...");
  const existentes = await db.demanda.findMany({
    where: { numeroExterno: { not: null } },
    select: { numeroExterno: true },
  });
  const existentesSet = new Set(existentes.map((d) => d.numeroExterno));
  console.log(`   ${existentesSet.size.toLocaleString()} demandas já importadas`);

  const rowsFiltradas = rows.filter((row) => !existentesSet.has(String(row["id"])));
  console.log(`   ${rowsFiltradas.length.toLocaleString()} novas demandas a importar\n`);

  if (rowsFiltradas.length === 0) {
    console.log("✅ Nenhum registro novo para importar.");
    return;
  }

  // 4. Importar em batches
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  console.log("📥 Iniciando importação...\n");
  const startTime = Date.now();

  for (let i = 0; i < rowsFiltradas.length; i += BATCH_SIZE) {
    const batch = rowsFiltradas.slice(i, i + BATCH_SIZE);
    const batchData = [];

    for (const row of batch) {
      try {
        const demanda = mapRowToDemanda(row, sistemUserId);
        batchData.push(demanda);
      } catch (err) {
        errorCount++;
        errors.push({ id: row["id"], error: err.message });
      }
    }

    try {
      await db.demanda.createMany({
        data: batchData,
        skipDuplicates: true,
      });
      successCount += batchData.length;
    } catch (err) {
      // Fallback: inserir um por um
      for (const demandaData of batchData) {
        try {
          await db.demanda.create({ data: demandaData });
          successCount++;
        } catch (innerErr) {
          errorCount++;
          errors.push({
            id: demandaData.numeroExterno,
            error: innerErr.message.substring(0, 100),
          });
        }
      }
    }

    progressBar(Math.min(i + BATCH_SIZE, rowsFiltradas.length), rowsFiltradas.length);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write("\n");

  // 5. Registrar DataSource
  if (opts.fromLine === 0) {
    await registrarDataSource(
      path.basename(EXCEL_FILE),
      allRows.length,
      sistemUserId,
      sha256
    );
  }

  // 6. Resumo
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                   RESUMO                        ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  ✅ Importados com sucesso: ${successCount.toLocaleString()}`);
  console.log(`  ❌ Erros:                  ${errorCount.toLocaleString()}`);
  console.log(`  ⏱️  Tempo:                 ${elapsed}s`);
  console.log(`  📊 Taxa:                  ${(successCount / elapsed).toFixed(0)} reg/s`);

  if (errors.length > 0) {
    console.log("\n⚠️  Primeiros 10 erros:");
    errors.slice(0, 10).forEach((e) => console.log(`   ID ${e.id}: ${e.error}`));
  }

  console.log("\n✅ Importação concluída!\n");
}

// ─── Executar ─────────────────────────────────────────────────────────────────
const opts = parseArgs();

importarDemandas(opts)
  .catch((err) => {
    console.error("\n❌ Erro fatal:", err.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
