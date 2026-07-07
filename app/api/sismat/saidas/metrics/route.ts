export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { SISMAT_PERIODOS, type SismatPeriodo } from "@/lib/sismat-metrics";
import {
  getSismatSaidasMetrics,
  SISMAT_SAIDA_DIMENSOES,
  type SismatSaidaDimensao,
} from "@/lib/sismat-saidas-metrics";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const dimRaw = sp.get("dimension") ?? "material";
    const perRaw = sp.get("period") ?? "monthly";

    const dimension: SismatSaidaDimensao = (SISMAT_SAIDA_DIMENSOES as readonly string[]).includes(dimRaw)
      ? (dimRaw as SismatSaidaDimensao)
      : "material";
    const period: SismatPeriodo = (SISMAT_PERIODOS as readonly string[]).includes(perRaw)
      ? (perRaw as SismatPeriodo)
      : "monthly";

    const data = await getSismatSaidasMetrics(dimension, period);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("[sismat/saidas/metrics] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter métricas de saídas SISMAT";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
