#!/usr/bin/env node
/**
 * Migração cirúrgica: cria apenas a tabela sismat."SiafiPagamento"
 * sem tocar em nenhuma outra tabela do banco.
 *
 * Uso (no terminal Windows, dentro da pasta do projeto):
 *   npx tsx scripts/migrate-add-siafi-pagamentos.ts
 */

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();

  console.log("🔌 Conectando ao banco Neon…");

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sismat."SiafiPagamento" (
        id                  TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
        "numeroProcesso"    TEXT          NOT NULL,
        "valorOB"           DECIMAL(15,2) NOT NULL,
        "valorProcesso"     DECIMAL(15,2),
        "dtPagtoSiafi"      TIMESTAMPTZ,
        ano                 TEXT,
        "nomeAutor"         TEXT,
        "nrOB"              TEXT,
        "tipoTransferencia" TEXT,
        "assuntoGeral"      TEXT,
        uf                  TEXT,
        municipio           TEXT,
        "varaExecucao"      TEXT,
        trf                 TEXT,
        observacao          TEXT,
        "criadoEm"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "SiafiPagamento_pkey" PRIMARY KEY (id)
      )
    `);
    console.log("✅ Tabela sismat.SiafiPagamento criada (ou já existia).");

    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SiafiPagamento_numeroProcesso_idx"
        ON sismat."SiafiPagamento"("numeroProcesso")
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SiafiPagamento_dtPagtoSiafi_idx"
        ON sismat."SiafiPagamento"("dtPagtoSiafi")
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SiafiPagamento_ano_idx"
        ON sismat."SiafiPagamento"(ano)
    `);
    console.log("✅ Índices criados.");

    // Verificação
    const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM sismat."SiafiPagamento"`
    );
    console.log(`\n📊 Tabela OK — ${result[0].count} linha(s) atualmente.`);
    console.log("\n✅ Migração concluída. Pode rodar o import-siafi-pagamentos.ts agora.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
