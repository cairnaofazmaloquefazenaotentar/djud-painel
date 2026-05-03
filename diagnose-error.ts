import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🔍 DIAGNÓSTICO DE ERROS\n");
  console.log("=" .repeat(70));

  try {
    // 1. Testar conexão com BD
    console.log("\n✅ Testando conexão com banco de dados...");
    const count = await db.demanda.count();
    console.log(`   ✅ Banco OK: ${count} demandas encontradas`);

    // 2. Testar query de métricas (a mais usada)
    console.log("\n✅ Testando query de métricas...");
    
    const totalDemandas = await db.demanda.count();
    const demandasAtivas = await db.demanda.count({
      where: {
        status: { not: "Concluída" }
      }
    });

    console.log(`   ✅ Total: ${totalDemandas}`);
    console.log(`   ✅ Ativas: ${demandasAtivas}`);

    // 3. Testar timeline (gráfico Tendência)
    console.log("\n✅ Testando timeline chart...");
    const timeline = await db.demanda.groupBy({
      by: ["dataEntradaDJUD"],
      _count: true,
    });
    console.log(`   ✅ Timeline: ${timeline.length} pontos`);

    // 4. Testar status distribution (gráfico Riscos)
    console.log("\n✅ Testando status distribution...");
    const statusDist = await db.demanda.groupBy({
      by: ["status"],
      _count: true,
    });
    console.log(`   ✅ Status: ${statusDist.length} tipos`);

    // 5. Testar medicamentos (gráfico Dimensionamento)
    console.log("\n✅ Testando top medicamentos...");
    const meds = await db.demanda.groupBy({
      by: ["principioAtivo"],
      _count: true,
    });
    console.log(`   ✅ Medicamentos: ${meds.length} únicos`);

    console.log("\n" + "=" .repeat(70));
    console.log("\n✅ TODAS AS QUERIES ESTÃO FUNCIONANDO!");
    console.log("\n⚠️  Se o erro persiste, pode ser:");
    console.log("   1. Cache do browser (Ctrl+Shift+Del e limpar cache)");
    console.log("   2. Problema no servidor Next.js");
    console.log("   3. Erro em um hook ou componente específico");

  } catch (error) {
    console.error("\n🔴 ERRO DETECTADO:");
    console.error(error);
  }

  await db.$disconnect();
}

main().catch(console.error);
