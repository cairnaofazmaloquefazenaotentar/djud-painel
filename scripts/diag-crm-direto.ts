#!/usr/bin/env node

/**
 * Executa getSaidasRedmineOverview() — a MESMA função que a rota
 * /api/sismat/saidas/redmine chama — direto contra o banco, sem passar por
 * HTTP, CDN da Vercel, cache do browser ou React Query.
 *
 * Serve para separar duas hipóteses que a tela não distingue:
 *   • porCrm vem com 15 itens aqui  → código e dados OK; o vazio na tela é
 *     cache/deploy (camada de transporte).
 *   • porCrm vem vazio aqui         → o bug é no código; a saída abaixo mostra
 *     exatamente onde a agregação perde as linhas.
 *
 * Somente leitura.
 *
 * Uso:
 *   npx tsx scripts/diag-crm-direto.ts
 */

import { getSaidasRedmineOverview } from "../lib/sismat-saidas-redmine-metrics";

async function main() {
  console.log("🔬 Executando getSaidasRedmineOverview() direto…\n");

  const over = await getSaidasRedmineOverview();

  console.log("KPIs");
  console.log(`   valor ........... ${over.kpis.valor.toLocaleString("pt-BR")}`);
  console.log(`   processos ....... ${over.kpis.processos}`);
  console.log(`   medicamentos .... ${over.kpis.medicamentos}`);
  console.log(`   saidas .......... ${over.kpis.saidas}`);
  console.log(`   hasData ......... ${over.hasData}`);

  console.log("\nTamanho dos rankings");
  console.log(`   topMed .......... ${over.topMed.length}`);
  console.log(`   porCrm .......... ${over.porCrm.length}   ← o gráfico vazio`);
  console.log(`   porOab .......... ${over.porOab.length}   ← o gráfico vazio`);
  console.log(`   porGrupo ........ ${over.porGrupo.length}`);
  console.log(`   porRegiao ....... ${over.porRegiao.length}`);
  console.log(`   porForma ........ ${over.porForma.length}`);
  console.log(`   porSabast ....... ${over.porSabast.length}`);

  const amostra = (nome: string, itens: { l: string; v: number }[]) => {
    console.log(`\n${nome} (3 primeiros)`);
    if (!itens.length) {
      console.log("   — vazio —");
      return;
    }
    itens.slice(0, 3).forEach((d) => console.log(`   ${JSON.stringify(d.l)} → ${d.v.toLocaleString("pt-BR")}`));
  };
  amostra("porCrm", over.porCrm);
  amostra("porOab", over.porOab);

  console.log(`\nOpções de filtro: crm=${over.opcoes.crm.length} | oab=${over.opcoes.oab.length}`);

  console.log("\n📌 VEREDITO");
  if (over.porCrm.length > 0) {
    console.log("   O servidor calcula os rankings corretamente.");
    console.log("   O vazio na tela é cache ou deploy desatualizado — não é código nem dado.");
  } else {
    console.log("   O ranking sai vazio já no servidor. É bug de código — me mande esta saída inteira.");
  }
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(async () => {
    const { db } = await import("../lib/db");
    await db.$disconnect();
  });
