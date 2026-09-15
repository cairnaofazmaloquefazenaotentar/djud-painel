export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getSiafiIndicadoresOverview } from "@/lib/siafi-indicadores-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextResponse } from "next/server";

/**
 * GET /api/siafi/indicadores
 * Agregados globais do cruzamento Demanda × SiafiPagamento:
 * KPIs, Top 15 CRM/OAB, distribuições e opções de filtro.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    return jsonComVersao(request, ["siafiPagamento", "demanda"], () =>
      getSiafiIndicadoresOverview()
    );
  } catch (error) {
    console.error("[siafi/indicadores] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao obter os indicadores de valor SIAFI";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
