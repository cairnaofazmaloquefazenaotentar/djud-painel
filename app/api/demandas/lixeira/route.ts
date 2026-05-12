export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/demandas/lixeira
 * Lista demandas em soft delete (lixeira), paginadas.
 * Demandas deletadas há mais de 30 dias são filtradas (serão purgadas por cron).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!hasPermission(session.user as any, "demandas:read")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const pageSize = Math.min(50, parseInt(sp.get("pageSize") || "20"));
    const skip = (page - 1) * pageSize;

    // Apenas demandas deletadas nos últimos 30 dias
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const where = {
      deletedAt: { not: null, gte: thirtyDaysAgo },
    };

    const [demandas, total] = await Promise.all([
      db.demanda.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { deletedAt: "desc" },
        select: {
          id: true,
          numero: true,
          titulo: true,
          status: true,
          prioridade: true,
          deletedAt: true,
          criadoEm: true,
          responsavel: { select: { id: true, name: true } },
        },
      }),
      db.demanda.count({ where }),
    ]);

    return NextResponse.json({
      data: demandas,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar lixeira" }, { status: 500 });
  }
}
