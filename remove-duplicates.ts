import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🔥 REMOVENDO DUPLICATAS DE DEMANDAS\n");
  console.log("=" .repeat(60));

  // Encontrar demandas SEM numeroExterno (1ª importação incompleta)
  const demandasSemExterno = await db.demanda.findMany({
    where: {
      numeroExterno: null,
    },
    select: {
      id: true,
      numero: true,
    },
  });

  console.log(`\n⚠️  Demandas SEM numeroExterno encontradas: ${demandasSemExterno.length}`);
  
  if (demandasSemExterno.length > 0) {
    console.log("\n📋 Removendo registros incompletos...");
    
    // Deletar em batches
    let deleted = 0;
    for (let i = 0; i < demandasSemExterno.length; i += 1000) {
      const batch = demandasSemExterno.slice(i, i + 1000);
      const batchIds = batch.map(d => d.id);
      
      const result = await db.demanda.deleteMany({
        where: {
          id: { in: batchIds },
        },
      });
      
      deleted += result.count;
      console.log(`   ✅ Batch ${Math.floor(i / 1000) + 1}: ${result.count} deletados`);
    }

    console.log(`\n✅ Total removido: ${deleted}`);
  }

  // Verificar resultado final
  const totalRestante = await db.demanda.count();
  console.log(`\n📊 Total de demandas após limpeza: ${totalRestante.toLocaleString("pt-BR")}`);
  console.log(`   Esperado: 51.501`);
  console.log(`   Status: ${totalRestante === 51501 ? "✅ CORRETO!" : "⚠️  DIFERENTE"}`);

  console.log("\n" + "=".repeat(60));

  await db.$disconnect();
}

main().catch(console.error);
