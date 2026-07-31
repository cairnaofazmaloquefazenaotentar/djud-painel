export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (q && q.length >= 2) {
      const termo = normalizar(q);
      where.OR = [
        { substanciaNorm: { contains: termo } },
        { substancia: { contains: q, mode: "insensitive" } },
      ];
    }

    const [registros, total] = await Promise.all([
      db.precoCmed.findMany({
        where,
        orderBy: { substancia: "asc" },
        skip,
        take: pageSize,
      }),
      db.precoCmed.count({ where }),
    ]);

    return NextResponse.json({
      data: registros,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("[precos/cmed]", error);
    return NextResponse.json({ error: "Erro ao consultar CMED" }, { status: 500 });
  }
}
