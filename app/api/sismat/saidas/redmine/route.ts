export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getSaidasRedmineOverview } from "@/lib/sismat-saidas-redmine-metrics";
import { NextResponse } from "next/server";

/**
 * GET /api/sismat/saidas/redmine
 * Agregados globais do cruzamento Saídas SISMAT × Redmine (por nº SEI):
 * KPIs, Top 20 medicamentos, Top 15 CRM/OAB, distribuições e opções de filtro.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const data = await getSaidasRedmineOverview();

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("[sismat/saidas/redmine] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao obter o cruzamento Saídas × Redmine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
