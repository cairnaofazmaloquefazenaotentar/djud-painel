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
    const uf = sp.get("uf")?.toUpperCase() || undefined;
    const anoMin = sp.get("anoMin") ? parseInt(sp.get("anoMin")!) : undefined;
    const anoMax = sp.get("anoMax") ? parseInt(sp.get("anoMax")!) : undefined;
    const apenasJudicial = sp.get("apenasJudicial") !== "false";
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));
    const skip = (page - 1) * pageSize;

    const where: any = { acaoJudicial: apenasJudicial ? true : undefined };
    if (apenasJudicial) where.acaoJudicial = true;
    if (q && q.length >= 2) {
      where.nomeNorm = { contains: normalizar(q) };
    }
    if (uf) where.uf = uf;
    if (anoMin || anoMax) {
      where.ano = {};
      if (anoMin) where.ano.gte = anoMin;
      if (anoMax) where.ano.lte = anoMax;
    }

    const [registros, total] = await Promise.all([
      db.precoSiasg.findMany({
        where,
        orderBy: { data: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          codigoCatmat: true,
          descricao: true,
          unidade: true,
          unidadeNorm: true,
          preco: true,
          qtd: true,
          valorTotal: true,
          modalidade: true,
          data: true,
          ano: true,
          uf: true,
          municipio: true,
          orgaoSup: true,
          orgao: true,
          fornecedor: true,
          fabricante: true,
          acaoJudicial: true,
        },
      }),
      db.precoSiasg.count({ where }),
    ]);

    return NextResponse.json({
      data: registros,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("[precos/siasg]", error);
    return NextResponse.json({ error: "Erro ao consultar SIASG" }, { status: 500 });
  }
}
