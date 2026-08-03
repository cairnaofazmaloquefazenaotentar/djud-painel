#!/usr/bin/env node

/**
 * Backfill: baseRedmine_*.xlsx → coluna Demanda.autor
 *
 * Preenche o campo `autor` (Autor(a) da ação — paciente/requerente) nas demandas
 * que JÁ existem no banco. É necessário porque a base foi importada antes do campo
 * `autor` existir no schema, então as demandas antigas ficaram com autor = NULL e a
 * curva de autores (aba Redmine) fica vazia.
 *
 * Por que um backfill e não re-rodar o importador:
 *   • import-excel-demandas usa createMany({ skipDuplicates: true }) — PULA as
 *     demandas já existentes, logo nunca preenche `autor` nelas.
 *   • Um wipe + reimport apagaria anexos, audit log, soft-deletes e edições manuais.
 * Este script só faz UPDATE do campo `autor`, sem tocar em mais nada.
 *
 * Match com a demanda existente (auto-detectado a partir do próprio banco, pois há
 * duas gerações de importador com esquemas de `numero` diferentes):
 *   • numero-djud .... numero = "DJUD-000043753"  (import-excel-demandas.js)
 *   • numero-raw ..... numero = "43753"           (import-excel-demandas.ts)
 *   • numeroExterno .. numeroExterno = "43753"     (fallback)
 * A chave de origem é sempre a coluna "id" (id do issue no Redmine).
 *
 * Idempotente: só grava onde autor mudou (IS DISTINCT FROM). Linhas com Autor(a)
 * vazio na planilha são ignoradas (não sobrescrevem um valor existente com NULL).
 *
 * Uso:
 *   npx tsx scripts/backfill-autor-demandas.ts --dry-run --file="/caminho/baseRedmine_17032026.xlsx"   (só parse, offline)
 *   npx tsx scripts/backfill-autor-demandas.ts --file="/caminho/baseRedmine_17032026.xlsx"              (preview: detecta esquema e conta o que mudaria, SEM gravar)
 *   npx tsx scripts/backfill-autor-demandas.ts --limit=100 --file="/caminho/..."                        (grava só 100 — teste)
 *   npx tsx scripts/backfill-autor-demandas.ts --confirm --file="/caminho/..."                          (grava tudo)
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
const CONFIRM = process.argv.includes("--confirm");
const LIMIT = parseInt(process.argv.find((a: string) => a.startsWith("--limit="))?.split("=")[1] || "0");

const COL_ID = "id";
const COL_AUTOR = "Autor(a)";

// ── Limpeza ───────────────────────────────────────────────────────────────────

/** null | número inteiro sem ".0" | texto aparado; "N/A" e afins viram null. */
function limpa(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "n/a" || low === "na" || low === "none") return null;
  return t;
}

// ── Leitura da planilha → mapa id → autor ──────────────────────────────────────

interface ParseResult {
  /** id do Redmine (string) → nome do autor (não-nulo). */
  porId: Map<string, string>;
  linhasLidas: number;
  comAutor: number;
  semAutor: number;
  idsDuplicados: number;
}

function lerPlanilha(): ParseResult {
  if (!XLSX_PATH) {
    console.error('❌ Informe o arquivo: --file="/caminho/baseRedmine_17032026.xlsx" (ou EXCEL_PATH).');
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

  // Resolve cabeçalhos por nome aparado (tolera espaços extras no header).
  const chaves = Object.keys(rows[0]);
  const resolve = (nome: string): string | null => chaves.find((k) => k.trim() === nome.trim()) ?? null;
  const idKey = resolve(COL_ID);
  const autorKey = resolve(COL_AUTOR);
  if (!idKey) {
    console.error(`❌ Coluna "${COL_ID}" não encontrada no cabeçalho.`);
    process.exit(1);
  }
  if (!autorKey) {
    console.error(`❌ Coluna "${COL_AUTOR}" não encontrada no cabeçalho.`);
    process.exit(1);
  }

  const porId = new Map<string, string>();
  let comAutor = 0;
  let semAutor = 0;
  let idsDuplicados = 0;
  const total = LIMIT ? Math.min(LIMIT, rows.length) : rows.length;

  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const id = limpa(row[idKey]);
    const autor = limpa(row[autorKey]);
    if (!id) continue;
    if (!autor) {
      semAutor++;
      continue;
    }
    comAutor++;
    // Se o mesmo id aparecer mais de uma vez, mantém a 1ª ocorrência não-vazia.
    if (porId.has(id)) idsDuplicados++;
    else porId.set(id, autor);
  }

  console.log("\n📊 Resumo do parsing:");
  console.log(`   Linhas lidas ............. ${total}`);
  console.log(`   Com Autor(a) ............. ${comAutor}`);
  console.log(`   Sem Autor(a) (ignoradas) . ${semAutor}`);
  console.log(`   ids distintos c/ autor ... ${porId.size}`);
  if (idsDuplicados) console.log(`   ids repetidos (1ª vence) . ${idsDuplicados}`);
  const amostra = Array.from(porId.entries()).slice(0, 3);
  if (amostra.length) {
    console.log("\n🔎 Amostra id → autor:");
    for (const [id, autor] of amostra) console.log(`   ${id} → ${autor}`);
  }

  return { porId, linhasLidas: total, comAutor, semAutor, idsDuplicados };
}

// ── Detecção do esquema de `numero` em produção ────────────────────────────────

type MatchMode = "numero-djud" | "numero-raw" | "numeroExterno";

interface MatchPlan {
  mode: MatchMode;
  /** coluna do Demanda usada no WHERE (identificador já entre aspas). */
  col: string;
  /** constrói a chave de match a partir do id do Redmine. */
  key: (id: string) => string;
}

async function detectarEsquema(db: any): Promise<MatchPlan> {
  const sample: Array<{ numero: string; numeroExterno: string | null }> = await db.demanda.findMany({
    take: 500,
    where: { deletedAt: null },
    select: { numero: true, numeroExterno: true },
  });
  if (!sample.length) {
    console.error("❌ Nenhuma demanda encontrada no banco — nada para atualizar.");
    process.exit(1);
  }

  const n = sample.length;
  const djud = sample.filter((d) => /^DJUD-\d+$/i.test(d.numero)).length;
  const raw = sample.filter((d) => /^\d+$/.test(d.numero)).length;
  const ext = sample.filter((d) => d.numeroExterno && /^\d+$/.test(d.numeroExterno)).length;
  const thr = n * 0.8;

  console.log(
    `\n🧭 Detecção de esquema (amostra ${n}): numero=DJUD ${djud} · numero=id-cru ${raw} · numeroExterno ${ext}`
  );

  // Prioriza casar por `numero` (chave única/indexada). numeroExterno é fallback.
  if (djud >= thr) {
    return {
      mode: "numero-djud",
      col: '"numero"',
      key: (id) => `DJUD-${id.padStart(6, "0")}`,
    };
  }
  if (raw >= thr) {
    return { mode: "numero-raw", col: '"numero"', key: (id) => id };
  }
  if (ext >= thr) {
    return { mode: "numeroExterno", col: '"numeroExterno"', key: (id) => id };
  }

  console.error(
    "❌ Não foi possível determinar com segurança o esquema de `numero` em produção " +
      "(amostra ambígua). Verifique manualmente antes de prosseguir."
  );
  process.exit(1);
}

// ── Aplicação (preview ou gravação) ────────────────────────────────────────────

async function aplicar(db: any, entries: Array<[string, string]>, plan: MatchPlan, gravar: boolean) {
  const { Prisma } = require("@prisma/client");
  let matched = 0; // casaram com uma demanda existente
  let changed = 0; // teriam autor alterado (ou foram alterados, se gravar)

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const lote = entries.slice(i, i + BATCH_SIZE);
    const tuples = lote.map(([id, autor]) => Prisma.sql`(${plan.key(id)}::text, ${autor}::text)`);
    const values = Prisma.join(tuples);
    const col = Prisma.raw(plan.col);

    if (gravar) {
      const afetadas = await db.$executeRaw`
        UPDATE "Demanda" AS d
        SET autor = v.autor, "atualizadoEm" = now()
        FROM (VALUES ${values}) AS v(k, autor)
        WHERE d.${col} = v.k
          AND d."deletedAt" IS NULL
          AND d.autor IS DISTINCT FROM v.autor
      `;
      changed += Number(afetadas);
      matched += Number(afetadas); // no modo gravação só contamos as efetivamente alteradas
    } else {
      const [row] = await db.$queryRaw<Array<{ matched: bigint; changed: bigint }>>`
        SELECT
          COUNT(*)::bigint                                              AS matched,
          COUNT(*) FILTER (WHERE d.autor IS DISTINCT FROM v.autor)::bigint AS changed
        FROM "Demanda" AS d
        JOIN (VALUES ${values}) AS v(k, autor) ON d.${col} = v.k
        WHERE d."deletedAt" IS NULL
      `;
      matched += Number(row.matched);
      changed += Number(row.changed);
    }
    process.stdout.write(`\r   ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}`);
  }
  process.stdout.write("\n");
  return { matched, changed };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Backfill Demanda.autor (Autor(a) da ação)");
  console.log(`🔧 Modo: ${DRY_RUN ? "DRY_RUN (offline)" : LIMIT ? `LIMIT ${LIMIT}` : CONFIRM ? "FULL + CONFIRM" : "PREVIEW"}\n`);

  const { porId } = lerPlanilha();
  const entries = Array.from(porId.entries());

  // DRY_RUN: só parse, sem tocar no banco (funciona sem DATABASE_URL).
  if (DRY_RUN) {
    console.log("\n✅ DRY_RUN concluído — banco não foi consultado nem alterado.");
    return;
  }

  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const plan = await detectarEsquema(db);
    const gravar = CONFIRM || LIMIT > 0;

    if (!gravar) {
      // PREVIEW: conta o que casaria/mudaria, sem gravar nada.
      const { matched, changed } = await aplicar(db, entries, plan, false);
      console.log("\n📋 PREVIEW (nada foi gravado):");
      console.log(`   Esquema ................. ${plan.mode}`);
      console.log(`   ids na planilha ......... ${entries.length}`);
      console.log(`   Casaram com demandas .... ${matched}`);
      console.log(`   Seriam atualizadas ...... ${changed}`);
      const naoCasaram = entries.length - matched;
      if (naoCasaram > 0) console.log(`   ⚠️  Sem correspondência .. ${naoCasaram}`);
      if (matched === 0) {
        console.log(
          "\n⛔ Nenhuma demanda casou — o esquema detectado pode estar errado. NÃO use --confirm ainda."
        );
      } else {
        console.log("\n➡️  Revise os números acima. Para gravar de fato:");
        console.log(`   npx tsx scripts/backfill-autor-demandas.ts --confirm --file="${XLSX_PATH}"`);
      }
      return;
    }

    // GRAVAÇÃO (--confirm ou --limit=N).
    console.log(`\n💾 Atualizando autor em lotes de ${BATCH_SIZE} (esquema ${plan.mode})…`);
    const { changed } = await aplicar(db, entries, plan, true);
    console.log(`\n✅ Backfill concluído: ${changed} demanda(s) atualizada(s).`);
    if (LIMIT) console.log(`   (LIMIT ${LIMIT} — rode com --confirm para aplicar em toda a base.)`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
