export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { SISMAT_PERIODOS, type SismatPeriodo } from "@/lib/sismat-metrics";
import { getSismatEstoqueMetrics } from "@/lib/sismat-estoque-metrics";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const perRaw = request.nextUrl.searchParams.get("period") ?? "monthly";
    const period: SismatPeriodo = (SISMAT_PERIODOS as readonly string[]).includes(perRaw)
      ? (perRaw as SismatPeriodo)
      : "monthly";

    const data = await getSismatEstoqueMetrics(period);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("[sismat/estoque] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter métricas de estoque SISMAT";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
