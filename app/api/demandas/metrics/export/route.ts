export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMetricsData } from "@/lib/metrics";
import { getRankingAnual, type RankingAnualData } from "@/lib/metrics-ranking-anual";
import { csvDoPainel, descreverRecorte, paginaPainelHTML } from "@/lib/metrics-export";
import { lerFiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demandas/metrics/export?format=csv|html[&rankingAnual=1]
//
// Exporta o painel analítico com os MESMOS filtros da tela: planilha (CSV,
// aberto direto no Excel) ou relatório imprimível (HTML → PDF pelo navegador).
//
// A apuração é refeita no servidor em vez de serializar o que está no
// navegador: assim a planilha carrega a série mensal completa, e não só os
// pontos que couberam no gráfico.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const formato = sp.get("format") === "html" ? "html" : "csv";
    const comRanking = sp.get("rankingAnual") === "1";

    const filtro = lerFiltroDemandas(sp);
    const parametros = { filtro };

    const [metrics, ranking] = await Promise.all([
      getMetricsData(parametros),
      comRanking ? getRankingAnual(parametros) : Promise.resolve<RankingAnualData | null>(null),
    ]);

    // O que vai impresso como "recorte da análise": só os filtros realmente
    // aplicados, com o rótulo que o usuário vê na tela.
    const descritos = descreverRecorte(filtro, metrics);

    const geradoEm = new Date();
    const ctx = {
      geradoEm,
      filtros: descritos,
      responsavel: (session.user.name as string) || (session.user.email as string) || "",
    };

    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "PainelDemandas",
        entityId: null,
        userId: session.user.id as string,
        metadata: {
          formato,
          rankingAnual: comRanking,
          filtros: Object.fromEntries(descritos),
          totalDemandas: metrics.totalDemandas,
        },
      },
    });

    const stamp = geradoEm.toISOString().slice(0, 10);

    if (formato === "html") {
      return new NextResponse(paginaPainelHTML(metrics, ranking, ctx), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="painel_djud_${stamp}.html"`,
        },
      });
    }

    return new NextResponse(csvDoPainel(metrics, ranking, ctx), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="painel_djud_${stamp}.csv"`,
      },
    });
  } catch (error) {
    console.error("[metrics/export] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao exportar o painel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
