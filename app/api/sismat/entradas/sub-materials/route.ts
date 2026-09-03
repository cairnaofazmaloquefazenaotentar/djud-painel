export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TIPOS_AQUISICAO } from "@/lib/sismat-metrics";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sismat/entradas/sub-materials?materialNome=VENETOCLAX
 * Retorna a lista distinta de valores da coluna `material` (nome bruto/específico)
 * para o princípio ativo (materialNome) informado, filtrado a aquisições.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const materialNome = request.nextUrl.searchParams.get("materialNome");
    if (!materialNome) {
      return NextResponse.json({ error: "Parâmetro materialNome é obrigatório" }, { status: 400 });
    }

    const rows = await db.sismatEntrada.findMany({
      where: {
        tipoMovimentacao: { in: [...TIPOS_AQUISICAO] },
        materialNome,
        material: { not: "" },
      },
      select: { material: true },
      distinct: ["material"],
      orderBy: { material: "asc" },
    });

    const materials = rows.map((r) => r.material).filter(Boolean);

    return NextResponse.json({ materials });
  } catch (error) {
    console.error("[sismat/entradas/sub-materials] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter sub-materiais";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
