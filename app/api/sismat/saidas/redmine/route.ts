export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getSaidasRedmineOverview } from "@/lib/sismat-saidas-redmine-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextResponse } from "next/server";

/**
 * GET /api/sismat/saidas/redmine
 * Agregados globais do cruzamento Saídas SISMAT × Redmine (por nº SEI):
 * KPIs, Top 20 medicamentos, Top 15 CRM/OAB, distribuições e opções de filtro.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    return jsonComVersao(request, ["sismatSaida", "redmineSei"], () =>
      getSaidasRedmineOverview()
    );
  } catch (error) {
    console.error("[sismat/saidas/redmine] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao obter o cruzamento Saídas × Redmine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
