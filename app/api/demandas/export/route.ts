export const runtime = "nodejs";
export const maxDuration = 120;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { aplicarFiltro, whereDemandas } from "@/lib/demandas-filtro";
import { descreverFiltro, lerFiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { FORMATOS_EXPORT, lerAgrupamento, lerColunas, type FormatoExport } from "@/lib/demandas-colunas";
import {
  csvDemandas,
  htmlDemandas,
  lerDemandasParaExportar,
  streamDeTexto,
  xlsxDemandas,
  type ContextoExportDemandas,
} from "@/lib/demandas-export";
import { registrarRelatorio } from "@/lib/relatorio-registro";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demandas/export?formato=csv|xlsx|html&colunas=a,b&agrupar=status
//   + o filtro da lista (lib/demandas-filtro-tipos.ts), ou ?ids=… para a
//   seleção. Mesmo WHERE da lista: o arquivo traz exatamente o que a tela
//   conta, sem o teto de 10.000 linhas da exportação antiga. Grava AuditLog
//   (EXPORT) e RelatorioGerado (DEMANDAS).
// ─────────────────────────────────────────────────────────────────────────────

const TIPO: Record<FormatoExport, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html; charset=utf-8",
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "export:csv")) {
      return NextResponse.json({ error: "Sem permissão para exportar" }, { status: 403 });
    }
    const sp = request.nextUrl.searchParams;
    const formato = (FORMATOS_EXPORT as readonly string[]).includes(sp.get("formato") ?? "")
      ? (sp.get("formato") as FormatoExport)
      : "csv";
    const colunas = lerColunas(sp.get("colunas"));
    const agrupar = lerAgrupamento(sp.get("agrupar"));
    const filtro = lerFiltroDemandas(sp);
    const aplicado = await aplicarFiltro(filtro);
    if (aplicado.vazio) {
      return NextResponse.json({ error: aplicado.motivo ?? "Código não encontrado" }, { status: 400 });
    }

    const linhas = await lerDemandasParaExportar(whereDemandas(aplicado));
    const geradoEm = new Date();
    const ctx: ContextoExportDemandas = {
      geradoEm,
      responsavel: (session.user.name as string) || (session.user.email as string) || "",
      filtros: descreverFiltro(filtro),
      colunas,
      agrupar,
    };
    const userId = session.user.id as string;
    const nomeArquivo = `demandas_${geradoEm.toISOString().slice(0, 10)}.${formato}`;
    const metadados = {
      formato,
      escopo: filtro.ids.length ? "selecao" : "filtro",
      total: linhas.length,
      colunas,
      agrupar,
      filtros: Object.fromEntries(ctx.filtros),
    };
    await db.auditLog.create({
      data: { action: "EXPORT", entity: "Demanda", entityId: null, userId, metadata: metadados },
    });
    await registrarRelatorio({
      tipo: "DEMANDAS",
      parametros: metadados,
      nomeArquivo,
      tamanhoBytes: null,
      geradoPorId: userId,
    });

    const corpo =
      formato === "xlsx"
        ? await xlsxDemandas(linhas, ctx)
        : streamDeTexto(formato === "html" ? htmlDemandas(linhas, ctx) : csvDemandas(linhas, ctx));
    return new NextResponse(corpo, {
      headers: {
        "Content-Type": TIPO[formato],
        "Content-Disposition": `${formato === "html" ? "inline" : "attachment"}; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
        "X-Total-Demandas": String(linhas.length),
      },
    });
  } catch (error) {
    console.error("[demandas/export]", error);
    return NextResponse.json({ error: "Não foi possível gerar a exportação" }, { status: 500 });
  }
}
