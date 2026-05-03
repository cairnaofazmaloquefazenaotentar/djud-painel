import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("✅ VERIFICANDO LIMPEZA E ANALISANDO GRÁFICOS\n");
  console.log("=" .repeat(70));

  // 1. Confirmar total de demandas
  const totalDemandas = await db.demanda.count();
  console.log(`\n📊 TOTAL DE DEMANDAS NO BANCO: ${totalDemandas.toLocaleString("pt-BR")}`);
  console.log(`   Esperado: 51.501`);
  console.log(`   Status: ${totalDemandas === 51501 ? "✅ CORRETO" : "🔴 DIFERENTE"}`);

  // 2. Analisar Status Distribution (Riscos)
  const statusDist = await db.demanda.groupBy({
    by: ["status"],
    _count: true,
    orderBy: {
      _count: {
        status: "desc",
      },
    },
  });

  console.log(`\n📈 GRÁFICO: STATUS/RISCOS`);
  console.log(`   Total de status únicos: ${statusDist.length}`);
  console.log(`   Top 5 status:`);
  statusDist.slice(0, 5).forEach((s: any) => {
    console.log(`      - ${s.status}: ${s._count.toLocaleString("pt-BR")}`);
  });

  // 3. Analisar Prioridade Distribution (Riscos)
  const priorDist = await db.demanda.groupBy({
    by: ["prioridade"],
    _count: true,
    orderBy: {
      _count: {
        prioridade: "desc",
      },
    },
  });

  console.log(`\n📊 GRÁFICO: PRIORIDADE/RISCOS`);
  console.log(`   Total de prioridades: ${priorDist.length}`);
  priorDist.forEach((p: any) => {
    console.log(`      - ${p.prioridade}: ${p._count.toLocaleString("pt-BR")}`);
  });

  // 4. Analisar TRF (Geografia)
  const trfDist = await db.demanda.groupBy({
    by: ["trfRegiao"],
    _count: true,
  });

  const trfFiltered = trfDist.filter((t: any) => t.trfRegiao !== null);
  console.log(`\n🗺️  GRÁFICO: TRF REGIÃO/GEOGRAFIA`);
  console.log(`   Total de TRFs com dados: ${trfFiltered.length}`);
  console.log(`   Total de processos com TRF: ${trfFiltered.reduce((sum: number, t: any) => sum + t._count, 0).toLocaleString("pt-BR")}`);
  console.log(`   Top 5 TRFs:`);
  trfFiltered
    .sort((a: any, b: any) => b._count - a._count)
    .slice(0, 5)
    .forEach((t: any) => {
      console.log(`      - TRF ${t.trfRegiao}ª: ${t._count.toLocaleString("pt-BR")}`);
    });

  // 5. Analisar Região Brasil (Geografia)
  const regiaoDist = await db.demanda.groupBy({
    by: ["regiaoBrasil"],
    _count: true,
  });

  const regiaoFiltered = regiaoDist.filter((r: any) => r.regiaoBrasil !== null);
  console.log(`\n🗺️  GRÁFICO: REGIÃO BRASIL/GEOGRAFIA`);
  console.log(`   Total de regiões: ${regiaoFiltered.length}`);
  console.log(`   Total de processos com região: ${regiaoFiltered.reduce((sum: number, r: any) => sum + r._count, 0).toLocaleString("pt-BR")}`);
  regiaoFiltered
    .sort((a: any, b: any) => b._count - a._count)
    .forEach((r: any) => {
      console.log(`      - ${r.regiaoBrasil}: ${r._count.toLocaleString("pt-BR")}`);
    });

  // 6. Analisar Area Temática (Dimensionamento)
  const areaDist = await db.demanda.groupBy({
    by: ["areaTematica"],
    _count: true,
  });

  const areaFiltered = areaDist.filter((a: any) => a.areaTematica !== null);
  console.log(`\n💊 GRÁFICO: ÁREA TEMÁTICA/DIMENSIONAMENTO`);
  console.log(`   Total de áreas temáticas: ${areaFiltered.length}`);
  console.log(`   Total de processos com área: ${areaFiltered.reduce((sum: number, a: any) => sum + a._count, 0).toLocaleString("pt-BR")}`);
  console.log(`   Top 5 áreas:`);
  areaFiltered
    .sort((a: any, b: any) => b._count - a._count)
    .slice(0, 5)
    .forEach((a: any) => {
      console.log(`      - ${a.areaTematica}: ${a._count.toLocaleString("pt-BR")}`);
    });

  // 7. Analisar Medicamentos (Dimensionamento)
  const medDist = await db.demanda.groupBy({
    by: ["principioAtivo"],
    _count: true,
  });

  const medFiltered = medDist.filter((m: any) => m.principioAtivo !== null);
  console.log(`\n💊 GRÁFICO: TOP MEDICAMENTOS/DIMENSIONAMENTO`);
  console.log(`   Total de princípios ativos: ${medFiltered.length}`);
  console.log(`   Total de processos com medicamento: ${medFiltered.reduce((sum: number, m: any) => sum + m._count, 0).toLocaleString("pt-BR")}`);
  console.log(`   Top 5 medicamentos:`);
  medFiltered
    .sort((a: any, b: any) => b._count - a._count)
    .slice(0, 5)
    .forEach((m: any) => {
      console.log(`      - ${m.principioAtivo}: ${m._count.toLocaleString("pt-BR")}`);
    });

  // 8. Timeline (Tendência)
  const timelineAgg = await db.demanda.groupBy({
    by: ["dataEntradaDJUD"],
    _count: true,
  });

  const timelineFiltered = timelineAgg.filter((t: any) => t.dataEntradaDJUD !== null);
  console.log(`\n📅 GRÁFICO: SÉRIE HISTÓRICA/TENDÊNCIA`);
  console.log(`   Total de meses com dados: ${timelineFiltered.length}`);
  console.log(`   Total de processos com data: ${timelineFiltered.reduce((sum: number, t: any) => sum + t._count, 0).toLocaleString("pt-BR")}`);

  // 9. Responsáveis (Operacional)
  const respDist = await db.demanda.groupBy({
    by: ["responsavelId"],
    _count: true,
  });

  const respFiltered = respDist.filter((r: any) => r.responsavelId !== null);
  console.log(`\n👥 GRÁFICO: TOP RESPONSÁVEIS/OPERACIONAL`);
  console.log(`   Total de responsáveis: ${respFiltered.length}`);
  console.log(`   Total de processos com responsável: ${respFiltered.reduce((sum: number, r: any) => sum + r._count, 0).toLocaleString("pt-BR")}`);
  console.log(`   Top 5 responsáveis:`);
  
  const respWithNames = await db.demanda.groupBy({
    by: ["responsavelId"],
    _count: true,
  });

  for (const resp of respWithNames.slice(0, 5)) {
    const user = await db.user.findUnique({
      where: { id: resp.responsavelId || "" },
      select: { name: true },
    });
    console.log(`      - ${user?.name || "Sem responsável"}: ${resp._count.toLocaleString("pt-BR")}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ ANÁLISE COMPLETA");

  await db.$disconnect();
}

main().catch(console.error);
