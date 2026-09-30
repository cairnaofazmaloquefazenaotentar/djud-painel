export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getRankingAnual } from "@/lib/metrics-ranking-anual";
import { filterMetricsSchema } from "@/lib/schemas";
import { jsonComVersao } from "@/lib/data-version";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demandas/metrics/ranking-anual — os principais rankings do painel
// abertos em série anual, para comparação entre exercícios.
//
// Mesmos filtros de /api/demandas/metrics (inclusive o código CATMAT), rota à
// parte porque são sete agregações adicionais: só rodam quando a tela liga o
// modo de comparação por ano.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters = filterMetricsSchema.parse({
      startDate: sp.get("startDate") ?? undefined,
      endDate: sp.get("endDate") ?? undefined,
      status: sp.get("status") ?? undefined,
      prioridade: sp.get("prioridade") ?? undefined,
      principioAtivo: sp.get("principioAtivo") ?? undefined,
      organizacaoId: sp.get("organizacaoId") ?? undefined,
      catmat: sp.get("catmat") ?? undefined,
    });

    return jsonComVersao(request, ["demanda"], () =>
      getRankingAnual({
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        status: filters.status,
        prioridade: filters.prioridade,
        principioAtivo: filters.principioAtivo,
        organizacaoId: filters.organizacaoId,
        catmat: filters.catmat,
      })
    );
  } catch (error) {
    console.error("[metrics/ranking-anual] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter o ranking anual";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
