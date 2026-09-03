#!/usr/bin/env node

/**
 * Script de Importação: baseRedmine_*.xlsx → sismat.RedmineSeiAtributos
 *
 * Constrói a tabela de apoio "1 linha por NUP SEI" usada pelo dashboard de
 * Saídas (cruzamento Redmine × SISMAT). NÃO altera a tabela Demanda.
 *
 * Regras (réplica fiel do dashboard_redmine_sismat.html de referência):
 *   • Chave: coluna "NUP_SEI Principal".
 *   • Consolidação: para cada campo, vale a 1ª ocorrência NÃO-VAZIA na ordem
 *     do arquivo (o Redmine tem várias linhas por SEI; as posteriores só
 *     preenchem o que ainda estiver vazio).
 *   • Limpeza: "N/A"/"n/a"/"NA"/vazio → nulo; números inteiros do Excel viram
 *     texto sem ".0"; CRM/OAB perdem o separador de milhar ("20.374" → "20374").
 *   • UF = coluna "UF_Residência " (com espaço ao final no cabeçalho!) — é a
 *     que bate com o dashboard de referência, não a coluna "UF".
 *   • Status = coluna "status" do Redmine (não "Ponto de Controle").
 *
 * Uso:
 *   npx tsx scripts/import-redmine-sei.ts --dry-run --file="/caminho/baseRedmine_17-03-2026.xlsx"
 *   npx tsx scripts/import-redmine-sei.ts --truncate --confirm --file="/caminho/baseRedmine_17-03-2026.xlsx"
 *
 * (Caminhos com espaço: manter as aspas em volta do --file=.)
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// ── Config ────────────────────────────────────────────────────────────────────

const FILE_ARG = process.argv.find((a: string) => a.startsWith("--file="))?.slice("--file=".length);
const XLSX_PATH = FILE_ARG || process.env.EXCEL_PATH || "";
const SHEET_NAME = "Dados Redmine";
const BATCH_SIZE = 1000;
const DRY_RUN = process.argv.includes("--dry-run");
const TRUNCATE = process.argv.includes("--truncate");
const CONFIRM = process.argv.includes("--confirm");
const LIMIT = parseInt(process.argv.find((a: string) => a.startsWith("--limit="))?.split("=")[1] || "0");

// ── Colunas de origem (resolvidas por nome APARADO, tolerando espaços extras) ─

const COL_SEI = "NUP_SEI Principal";
const CAMPOS: { key: string; header: string; semPontos?: boolean; numerico?: boolean }[] = [
  { key: "crm", header: "Nº CRM", semPontos: true },
  { key: "ufCrm", header: "UF CRM" },
  { key: "oab", header: "Nº OAB", semPontos: true },
  { key: "ufOab", header: "UF OAB" },
  { key: "grupoTematico", header: "Grupo Temático" },
  { key: "regiaoBrasil", header: "Região Brasil" },
  { key: "ufResidencia", header: "UF_Residência" }, // cabeçalho real tem espaço ao final
  { key: "formaCumprimento", header: "Forma de Cumprimento" },
  { key: "modalidadeTratamento", header: "Modalidade de Tratamento" },
  { key: "statusAbastecimento", header: "Status do Abastecimento" },
  { key: "statusRedmine", header: "status" },
  { key: "autor", header: "Autor(a)" },
  { key: "trfRegiao", header: "TRF Região", numerico: true },
];

// ── Limpeza ───────────────────────────────────────────────────────────────────

/** null | número inteiro sem ".0" | texto aparado; "N/A" e afins viram null. */
function limpa(v: unknown, semPontos = false): string | null {
  if (v === null || v === undefined) return null;
  let t: string;
  if (typeof v === "number") {
    t = Number.isInteger(v) ? String(v) : String(v);
  } else {
    t = String(v);
  }
  t = t.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "n/a" || low === "na" || low === "none") return null;
  if (semPontos) t = t.replace(/\./g, "");
  return t || null;
}

/** Converte valor para inteiro; retorna null se não for número válido. */
function limpaInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (isNaN(n)) return null;
  return Math.round(n);
}

// ── Leitura + consolidação por SEI ────────────────────────────────────────────

interface SeiAttrs {
  sei: string;
  crm: string | null;
  ufCrm: string | null;
  oab: string | null;
  ufOab: string | null;
  grupoTematico: string | null;
  regiaoBrasil: string | null;
  ufResidencia: string | null;
  formaCumprimento: string | null;
  modalidadeTratamento: string | null;
  statusAbastecimento: string | null;
  statusRedmine: string | null;
  autor: string | null;
  trfRegiao: number | null;
}

function lerConsolidado(): SeiAttrs[] {
  if (!XLSX_PATH) {
    console.error('❌ Informe o arquivo: --file="/caminho/baseRedmine_17-03-2026.xlsx" (ou EXCEL_PATH).');
    process.exit(1);
  }
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${XLSX_PATH}`);
    process.exit(1);
  }

  console.log(`📄 Lendo ${path.basename(XLSX_PATH)} (planilha "${SHEET_NAME}")…`);
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    console.error(`❌ Planilha "${SHEET_NAME}" não encontrada. Abas: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) {
    console.error("❌ Planilha vazia.");
    process.exit(1);
  }

  // Resolve cabeçalhos por nome aparado (o arquivo tem "UF_Residência " com espaço).
  const chaves = Object.keys(rows[0]);
  const resolve = (nome: string): string | null =>
    chaves.find((k) => k.trim() === nome.trim()) ?? null;

  const seiKey = resolve(COL_SEI);
  if (!seiKey) {
    console.error(`❌ Coluna "${COL_SEI}" não encontrada no cabeçalho.`);
    process.exit(1);
  }
  const mapa = CAMPOS.map((c) => ({ ...c, coluna: resolve(c.header) }));
  for (const c of mapa) {
    if (!c.coluna) console.warn(`⚠️  Coluna "${c.header}" não encontrada — campo ${c.key} ficará vazio.`);
  }

  const porSei = new Map<string, SeiAttrs>();
  const total = LIMIT ? Math.min(LIMIT, rows.length) : rows.length;

  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const sei = limpa(row[seiKey]);
    if (!sei) continue;

    let d = porSei.get(sei);
    if (!d) {
      d = {
        sei,
        crm: null,
        ufCrm: null,
        oab: null,
        ufOab: null,
        grupoTematico: null,
        regiaoBrasil: null,
        ufResidencia: null,
        formaCumprimento: null,
        modalidadeTratamento: null,
        statusAbastecimento: null,
        statusRedmine: null,
        autor: null,
        trfRegiao: null,
      };
      porSei.set(sei, d);
    }
    for (const c of mapa) {
      if (!c.coluna) continue;
      if (c.numerico) {
        // campo numérico (trfRegiao): trata separadamente para satisfazer o tipo
        if (d.trfRegiao === null && c.key === "trfRegiao") {
          const n = limpaInt(row[c.coluna]);
          if (n !== null) d.trfRegiao = n;
        }
      } else {
        const k = c.key as keyof Omit<SeiAttrs, "sei" | "trfRegiao">;
        if (d[k] === null) {
          const v = limpa(row[c.coluna], c.semPontos);
          if (v !== null) d[k] = v;
        }
      }
    }
  }

  const lista = Array.from(porSei.values());

  // Resumo
  const pct = (n: number) => `${((n / lista.length) * 100).toFixed(1)}%`;
  const cont = (k: keyof Omit<SeiAttrs, "sei">) => lista.filter((d) => d[k] !== null).length;
  console.log("\n📊 Resumo do parsing:");
  console.log(`   Linhas lidas .............. ${total}`);
  console.log(`   SEIs distintos ............ ${lista.length}`);
  for (const c of CAMPOS) {
    const k = c.key as keyof Omit<SeiAttrs, "sei">;
    const n = cont(k);
    console.log(`   ${c.key.padEnd(22, ".")} ${String(n).padStart(6)} (${pct(n)})`);
  }
  const a = lista.find((d) => d.crm && d.oab);
  if (a) {
    console.log("\n🔎 Amostra (1º SEI com CRM e OAB):");
    console.log(`   sei: ${a.sei} | crm: ${a.crm} | oab: ${a.oab}`);
    console.log(`   grupo: ${a.grupoTematico} | região: ${a.regiaoBrasil} | UF: ${a.ufResidencia}`);
    console.log(`   forma: ${a.formaCumprimento} | modal: ${a.modalidadeTratamento} | abastec: ${a.statusAbastecimento} | status: ${a.statusRedmine}`);
    console.log(`   autor: ${a.autor} | trf: ${a.trfRegiao}`);
  }
  return lista;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Importador Redmine → sismat.RedmineSeiAtributos");
  console.log(`🔧 Modo: ${DRY_RUN ? "DRY_RUN" : LIMIT ? `LIMIT ${LIMIT}` : "FULL"}${TRUNCATE ? " + TRUNCATE" : ""}\n`);

  const lista = lerConsolidado();

  if (DRY_RUN) {
    console.log("\n✅ DRY_RUN concluído — nenhum dado gravado.");
    return;
  }
  if (!LIMIT && !CONFIRM) {
    console.log(
      "\n⛔ Importação completa requer --confirm (ou use --limit=N para testar).\n" +
        '   Ex.: npx tsx scripts/import-redmine-sei.ts --truncate --confirm --file="/caminho/base.xlsx"'
    );
    return;
  }

  // Prisma só é carregado quando vamos gravar (dry-run funciona sem DATABASE_URL).
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    if (TRUNCATE) {
      const n = await db.redmineSeiAtributos.deleteMany({});
      console.log(`\n🧹 Tabela limpa (${n.count} registro(s) removido(s)).`);
    }
    console.log(`\n💾 Inserindo ${lista.length} registro(s) em lotes de ${BATCH_SIZE}…`);
    let inseridos = 0;
    for (let i = 0; i < lista.length; i += BATCH_SIZE) {
      const lote = lista.slice(i, i + BATCH_SIZE);
      await db.redmineSeiAtributos.createMany({ data: lote, skipDuplicates: true });
      inseridos += lote.length;
      process.stdout.write(`\r   ${inseridos}/${lista.length}`);
    }
    console.log(`\n\n✅ Importação concluída: ${inseridos} SEI(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
