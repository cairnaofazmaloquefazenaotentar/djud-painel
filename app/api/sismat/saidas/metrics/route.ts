export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import {
  getSismatSaidasMetrics,
  SISMAT_SAIDAS_DIMENSOES,
  type SismatSaidasDimensao,
} from "@/lib/sismat-saidas-metrics";
import { SISMAT_PERIODOS, type SismatPeriodo } from "@/lib/sismat-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sismat/saidas/metrics?dimension=material&period=monthly
 * Métricas de saídas SISMAT (saídas efetivas = Aquisição) por dimensão × período.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const dimRaw = sp.get("dimension") ?? "material";
    const perRaw = sp.get("period") ?? "monthly";

    const dimension: SismatSaidasDimensao = (
      SISMAT_SAIDAS_DIMENSOES as readonly string[]
    ).includes(dimRaw)
      ? (dimRaw as SismatSaidasDimensao)
      : "material";

    const period: SismatPeriodo = (SISMAT_PERIODOS as readonly string[]).includes(perRaw)
      ? (perRaw as SismatPeriodo)
      : "monthly";

    const subMaterial = sp.get("subMaterial") ?? undefined;

    return jsonComVersao(request, ["sismatSaida"], () =>
      getSismatSaidasMetrics(dimension, period, subMaterial)
    );
  } catch (error) {
    console.error("[sismat/saidas/metrics] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao obter métricas de saídas SISMAT";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
