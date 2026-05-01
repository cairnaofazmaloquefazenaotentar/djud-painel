export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getMetricsData } from "@/lib/metrics";
import { filterMetricsSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Parse and validate filters — usar ?? undefined para converter null em undefined (Zod não aceita null)
    const filters = filterMetricsSchema.parse({
      startDate:     searchParams.get("startDate")     ?? undefined,
      endDate:       searchParams.get("endDate")       ?? undefined,
      status:        searchParams.get("status")        ?? undefined,
      prioridade:    searchParams.get("prioridade")    ?? undefined,
      organizacaoId: searchParams.get("organizacaoId") ?? undefined,
    });

    // Convert date strings to Date objects
    const metricsFilters = {
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      status: filters.status,
      prioridade: filters.prioridade,
      organizacaoId: filters.organizacaoId,
    };

    const metricsData = await getMetricsData(metricsFilters);

    return NextResponse.json(metricsData, {
      headers: {
        "Cache-Control": "public, max-age=60", // Cache for 1 minute
      },
    });
  } catch (error) {
    console.error("[metrics] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter métricas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
