export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getSismatSaidasIndicadores } from "@/lib/sismat-saidas-indicadores";
import { jsonComVersao } from "@/lib/data-version";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sismat/saidas/indicadores
 * HHI de materiais, instabilidade de rank e proporção de incineração
 * — todos com janela móvel de 3 meses.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    return jsonComVersao(request, ["sismatSaida"], () =>
      getSismatSaidasIndicadores()
    );
  } catch (error) {
    console.error("[sismat/saidas/indicadores] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao calcular indicadores de saídas SISMAT";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
