export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getMetricsData } from "@/lib/metrics";
import { lerFiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { jsonComVersao } from "@/lib/data-version";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    // Filtro único (lib/demandas-filtro-tipos.ts): os mesmos parâmetros da
    // lista de Demandas — e os nomes antigos do painel continuam valendo.
    const filtro = lerFiltroDemandas(searchParams);
    const eixo = searchParams.get("eixoDataValor");
    const eixoDataValor = eixo === "processo" ? "processo" : eixo === "pagamento" ? "pagamento" : undefined;

    // As séries de valor leem o SIAFI: sem ele na versão, uma carga nova do
    // SIAFI não invalidava o cache do painel (B2).
    return jsonComVersao(request, ["demanda", "siafiPagamento"], () => getMetricsData({ filtro, eixoDataValor }));
  } catch (error) {
    console.error("[metrics] Erro:", error);
    return NextResponse.json({ error: "Não foi possível carregar as métricas agora" }, { status: 500 });
  }
}
