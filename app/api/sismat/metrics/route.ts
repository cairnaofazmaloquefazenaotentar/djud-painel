export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import {
  getSismatMetrics,
  SISMAT_DIMENSOES,
  SISMAT_PERIODOS,
  type SismatDimensao,
  type SismatPeriodo,
} from "@/lib/sismat-metrics";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const dimRaw = sp.get("dimension") ?? "fornecedor";
    const perRaw = sp.get("period") ?? "monthly";

    // Valida contra allowlist (evita valores arbitrários chegando à agregação)
    const dimension: SismatDimensao = (SISMAT_DIMENSOES as readonly string[]).includes(dimRaw)
      ? (dimRaw as SismatDimensao)
      : "fornecedor";
    const period: SismatPeriodo = (SISMAT_PERIODOS as readonly string[]).includes(perRaw)
      ? (perRaw as SismatPeriodo)
      : "monthly";

    const data = await getSismatMetrics(dimension, period);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" }, // 1h: base de referência muda pouco
    });
  } catch (error) {
    console.error("[sismat/metrics] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter métricas SISMAT";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
