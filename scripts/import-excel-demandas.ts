#!/usr/bin/env node

/**
 * Script de Importação: baseRedmine_17-03-2026.xlsx → BD
 * Importa 51.501 demandas judiciais do Excel para Prisma
 *
 * Uso:
 *   npx ts-node scripts/import-excel-demandas.ts --dry-run    (validar apenas)
 *   npx ts-node scripts/import-excel-demandas.ts --limit 100  (importar 100 linhas)
 *   npx ts-node scripts/import-excel-demandas.ts --confirm    (importar tudo)
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────

const EXCEL_PATH =
  process.env.EXCEL_PATH ||
  "C:\\Users\\Avell\\OneDrive\\Documentos\\DOUTORADO\\Possíveis Artigos para publicação - depois do ENMC com o profs Marcelo e Gentil\\Artigo_Judicialização_PNCP\\Base_Locoust5000\\baseRedmine_17-03-2026.xlsx";

const SHEET_NAME = "Dados Redmine";
const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = parseInt(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "0"
);
const CONFIRM = process.argv.includes("--confirm");

// ── Funções utilitárias ────────────────────────────────────────────────────

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date
    const excelEpoch = new Date(1900, 0, 1);
    return new Date(excelEpoch.getTime() + (value - 2) * 24 * 60 * 60 * 1000);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function sanitizeString(value: any): string | null {
  if (!value) return null;
  return String(value).trim() || null;
}

function sanitizeNumber(value: any): number | null {
  if (!value) return null;
  const num = parseInt(String(value).replace(/\D/g, ""));
  return isNaN(num) ? null : num;
}

// Converte valor monetário em formato brasileiro ("5.551.031,41") para number (5551031.41)
function parseValorBR(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const s = String(value).trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Importador de Demandas Excel → BD");
  console.log(`📄 Arquivo: ${path.basename(EXCEL_PATH)}`);
  console.log(`📊 Planilha: ${SHEET_NAME}`);
  console.log(`🔧 Modo: ${DRY_RUN ? "DRY_RUN" : LIMIT ? `LIMIT ${LIMIT}` : "FULL"}\n`);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${EXCEL_PATH}`);
    process.exit(1);
  }

  try {
    // Ler Excel
    console.log("📖 Lendo arquivo Excel...");
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[SHEET_NAME];

    if (!sheet) {
      console.error(`❌ Planilha '${SHEET_NAME}' não encontrada`);
      console.log(`Planilhas disponíveis: ${Object.keys(workbook.Sheets).join(", ")}`);
      process.exit(1);
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];
    console.log(`✅ ${rows.length} linhas encontradas\n`);

    // Limitar se especificado
    const rowsToProcess = LIMIT ? rows.slice(0, LIMIT) : rows;
    console.log(`📌 Processando: ${rowsToProcess.length} registros\n`);

    // Obter ou criar usuário SISTEMA
    let sistemaUser = await db.user.findFirst({
      where: { name: "SISTEMA" },
    });

    if (!sistemaUser && !DRY_RUN) {
      console.log("👤 Criando usuário SISTEMA...");
      sistemaUser = await db.user.create({
        data: {
          name: "SISTEMA",
          email: "sistema@djud.gov.br",
          emailVerified: new Date(),
          role: "ADMIN",
          password: "", // Sem senha
        },
      });
    }

    const sistemaUserId = sistemaUser?.id || "SISTEMA_USER_ID";

    // Processar em batches
    const batches = Math.ceil(rowsToProcess.length / BATCH_SIZE);
    let importedCount = 0;
    let errorCount = 0;

    for (let batchIdx = 0; batchIdx < batches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batchEnd = Math.min((batchIdx + 1) * BATCH_SIZE, rowsToProcess.length);
      const batch = rowsToProcess.slice(batchStart, batchEnd);

      console.log(`\n📦 Batch ${batchIdx + 1}/${batches} (${batchStart + 1}-${batchEnd})`);

      // Preparar dados para inserção
      const demandasToCreate: any[] = [];

      for (let idx = 0; idx < batch.length; idx++) {
        const row = batch[idx];
        try {
          // Campos principais
          const numero = sanitizeString(row.id || row["ID"] || row["numero"]) || `DEM-${Date.now()}-${idx}`;
          const titulo = sanitizeString(row.subject || row["Assunto"] || row["Subject"]);
          const status = sanitizeString(row.status || row["Status"] || row["Ponto de Controle"]) || "Aberta";

          if (!titulo) continue; // Skip se sem título

          // Campos judiciais
          const numeroProcesso = sanitizeString(row["Ação Judicial Originário"] || row["numeroProcesso"]);
          const areaTematica = sanitizeString(row["Grupo Temático"] || row["areaTematica"]);
          const regiaoBrasil = sanitizeString(row["Região Brasil"] || row["regiaoBrasil"]);
          const trfRegiao = sanitizeNumber(row["TRF Região"] || row["trfRegiao"]);
          const objetoAcao = sanitizeString(row["Objeto da Ação"] || row["objetoAcao"]);
          const principioAtivo = sanitizeString(row["Princípio_Ativo"] || row["principioAtivo"]);
          // Fornecedor/laboratório — campo ainda inexistente na base atual.
          // Aceita vários nomes prováveis; quando a exportação do Redmine trouxer a coluna, passa a ser preenchido.
          const fornecedor = sanitizeString(
            row["Fornecedor"] || row["Laboratório"] || row["Laboratorio"] ||
            row["Empresa"] || row["Fabricante"] || row["Detentor do Registro"] || row["fornecedor"]
          );
          const dataEntradaDJUD = parseDate(row["Data de Entrada_DJUD"] || row["dataEntradaDJUD"]);
          // Valor do depósito judicial (só preenchido em demandas de Cumprimento de Ordem Judicial)
          const valorEstimado = parseValorBR(row["Valor do Depósito (em reais)"] || row["valorEstimado"]);
          // Data real de criação no Redmine — sem isso, criadoEm cairia no default now() e a série histórica colapsaria num único mês
          const criadoEm = parseDate(row.created_on || row["created_on"]) ?? undefined;

          // Prioridade
          const prioridade = sanitizeString(row.priority || row["Priority"] || row["Prioridade"]) || "Normal";

          // Descrição (fallback)
          const descricao = sanitizeString(row.description || row["Description"]) || titulo || "";

          demandasToCreate.push({
            numero,
            titulo,
            descricao,
            status,
            prioridade,
            numeroProcesso,
            areaTematica,
            regiaoBrasil,
            trfRegiao,
            objetoAcao,
            principioAtivo,
            fornecedor,
            dataEntradaDJUD,
            valorEstimado,
            criadoEm,
            criadoPorId: sistemaUserId,
            responsavelId: null,
          });
        } catch (err) {
          console.error(`  ⚠️ Erro ao processar linha ${batchStart + idx + 1}:`, err);
        }
      }

      // Inserir batch
      if (!DRY_RUN && demandasToCreate.length > 0) {
        try {
          await db.demanda.createMany({
            data: demandasToCreate,
            skipDuplicates: true,
          });
          importedCount += demandasToCreate.length;
          console.log(`  ✅ Inseridos: ${demandasToCreate.length}`);
        } catch (err: any) {
          console.error(`  ❌ Erro ao inserir batch:`, err.message);
          errorCount += batch.length;
        }
      } else if (DRY_RUN) {
        console.log(`  🔍 DRY_RUN: ${demandasToCreate.length} registros válidos`);
        if (demandasToCreate.length > 0) {
          console.log(`  Exemplo 1:`, demandasToCreate[0]);
        }
      }
    }

    // Resumo
    console.log("\n📊 RESUMO DA IMPORTAÇÃO");
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total processado: ${rowsToProcess.length}`);
    if (!DRY_RUN) {
      console.log(`✅ Importados: ${importedCount}`);
      console.log(`❌ Erros: ${errorCount}`);
    } else {
      console.log(`🔍 Modo DRY_RUN: nenhum dado foi inserido`);
    }
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Verificar BD
    const demandasNoBD = await db.demanda.count();
    console.log(`📈 Total de demandas no BD: ${demandasNoBD}`);

    if (!CONFIRM && !DRY_RUN) {
      console.log(`\n⚠️  Use --confirm para executar a importação real`);
    }
  } catch (error) {
    console.error("❌ Erro fatal:", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// ── Executar ────────────────────────────────────────────────────────────────

main().catch(console.error);
