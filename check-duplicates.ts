import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("📊 ANÁLISE DE DUPLICATAS E QUANTIDADE DE PROCESSOS\n");
  console.log("=" .repeat(60));

  // 1. Total de demandas
  const totalDemandas = await db.demanda.count();
  console.log(`\n✅ Total de demandas no banco: ${totalDemandas.toLocaleString("pt-BR")}`);

  // 2. Verificar duplicatas por número
  const duplicadasPorNumero = await db.demanda.groupBy({
    by: ["numero"],
    _count: true,
    having: {
      numero: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  console.log(`\n⚠️  Demandas duplicadas por NÚMERO: ${duplicadasPorNumero.length}`);
  if (duplicadasPorNumero.length > 0) {
    console.log("Primeiras 10 duplicatas:");
    duplicadasPorNumero.slice(0, 10).forEach((d: any) => {
      console.log(`   - Número: "${d.numero}" → ${d._count} ocorrências`);
    });
  }

  // 3. Verificar duplicatas por numeroExterno
  const duplicadasPorExterno = await db.demanda.groupBy({
    by: ["numeroExterno"],
    _count: true,
    having: {
      numeroExterno: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  console.log(`\n⚠️  Demandas duplicadas por NÚMERO EXTERNO: ${duplicadasPorExterno.length}`);
  if (duplicadasPorExterno.length > 0) {
    console.log("Primeiras 10 duplicatas:");
    duplicadasPorExterno.slice(0, 10).forEach((d: any) => {
      console.log(`   - Externo: "${d.numeroExterno}" → ${d._count} ocorrências`);
    });
  }

  // 4. Demandas por status
  const demPorStatus = await db.demanda.groupBy({
    by: ["status"],
    _count: true,
    orderBy: {
      _count: {
        status: "desc",
      },
    },
  });

  console.log(`\n📈 Distribuição por STATUS:`);
  demPorStatus.forEach((s: any) => {
    console.log(`   - ${s.status}: ${s._count.toLocaleString("pt-BR")}`);
  });

  // 5. Contar eventos de importação no audit log
  const importEvents = await db.auditLog.count({
    where: {
      action: "CREATE",
      entity: "Demanda",
    },
  });

  console.log(`\n📝 Eventos CREATE de demandas no audit log: ${importEvents.toLocaleString("pt-BR")}`);

  // 6. Data de primeira e última demanda
  const primeira = await db.demanda.findFirst({
    orderBy: { criadoEm: "asc" },
  });
  const ultima = await db.demanda.findFirst({
    orderBy: { criadoEm: "desc" },
  });

  console.log(`\n📅 Cronologia:`);
  console.log(`   - Primeira demanda: ${primeira?.criadoEm.toLocaleDateString("pt-BR")}`);
  console.log(`   - Última demanda: ${ultima?.criadoEm.toLocaleDateString("pt-BR")}`);

  // 7. Verificar NULL em numeroExterno
  const semExterno = await db.demanda.count({
    where: {
      numeroExterno: null,
    },
  });

  console.log(`\n⚠️  Demandas SEM numeroExterno: ${semExterno.toLocaleString("pt-BR")}`);

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ RESUMO:");
  console.log(`   Total esperado (planilha): 51.501`);
  console.log(`   Total atual (BD): ${totalDemandas.toLocaleString("pt-BR")}`);
  console.log(`   Diferença: ${(totalDemandas - 51501).toLocaleString("pt-BR")}`);
  
  if (totalDemandas > 51501) {
    console.log(`\n🔴 ATENÇÃO: Há ${(totalDemandas - 51501).toLocaleString("pt-BR")} demandas a MAIS!`);
  }

  await db.$disconnect();
}

main().catch(console.error);
