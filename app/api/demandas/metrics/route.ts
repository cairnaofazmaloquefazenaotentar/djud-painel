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

    // Parse and validate filters
    const filters = filterMetricsSchema.parse({
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      status: searchParams.get("status"),
      prioridade: searchParams.get("prioridade"),
      organizacaoId: searchParams.get("organizacaoId"),
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
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao obter métricas" },
      { status: 500 }
    );
  }
}
