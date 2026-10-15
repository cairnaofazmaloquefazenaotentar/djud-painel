export const runtime = "nodejs";
export const maxDuration = 60;

import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { getMetricsData } from "@/lib/metrics";
import { getRankingAnual } from "@/lib/metrics-ranking-anual";
import { descreverRecorte } from "@/lib/metrics-export";
import { csvExecutivo, paginaExecutivoHTML } from "@/lib/relatorio-executivo";
import { lerFiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { registrarRelatorio } from "@/lib/relatorio-registro";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/relatorios/executivo?format=html|csv&<filtros de demandas>
//
// Panorama Executivo (Frente C): a visão do gestor sobre o MESMO recorte do
// Dashboard — mesmos parâmetros de filtro (lerFiltroDemandas), mesma apuração
// (getMetricsData + getRankingAnual). Sem filtro, a base inteira.
// Grava AuditLog (EXPORT, com o SHA-256 do arquivo) e RelatorioGerado (EXECUTIVO).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "relatorios:executivo")) {
      return NextResponse.json({ error: "Sem permissão para o Panorama Executivo" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const formato = sp.get("format") === "csv" ? "csv" : "html";
    const filtro = lerFiltroDemandas(sp);
    const [metrics, ranking] = await Promise.all([getMetricsData({ filtro }), getRankingAnual({ filtro })]);

    const geradoEm = new Date();
    const ctx = {
      geradoEm,
      filtros: descreverRecorte(filtro, metrics),
      responsavel: (session.user.name as string) || (session.user.email as string) || "",
    };
    const conteudo =
      formato === "html" ? paginaExecutivoHTML(metrics, ranking, ctx) : csvExecutivo(metrics, ranking, ctx);
    const bytes = Buffer.from(conteudo, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const nomeArquivo = `panorama_executivo_${geradoEm.toISOString().slice(0, 10)}.${formato}`;
    const userId = session.user.id as string;
    const metadados = {
      formato,
      filtros: Object.fromEntries(ctx.filtros),
      totalDemandas: metrics.totalDemandas,
      sha256,
      tamanhoBytes: bytes.length,
    };

    await db.auditLog.create({
      data: { action: "EXPORT", entity: "PanoramaExecutivo", entityId: null, userId, metadata: metadados },
    });
    await registrarRelatorio({
      tipo: "EXECUTIVO",
      parametros: { ...metadados, consulta: sp.toString() },
      nomeArquivo,
      tamanhoBytes: bytes.length,
      geradoPorId: userId,
    });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": formato === "html" ? "text/html; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `${formato === "html" ? "inline" : "attachment"}; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
        "X-Arquivo-Sha256": sha256,
        "X-Total-Demandas": String(metrics.totalDemandas),
      },
    });
  } catch (error) {
    console.error("[relatorios/executivo]", error);
    return NextResponse.json({ error: "Não foi possível gerar o Panorama Executivo" }, { status: 500 });
  }
}
