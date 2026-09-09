export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { sugerirMateriais } from "@/lib/pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/precos/catmat?q=<código ou trecho da descrição>
 *
 * Sugestões para os filtros "Código do material" e "Descrição CATMAT" da
 * Pesquisa de Preços. Dígitos pesquisam por prefixo de CATMAT e de registro
 * ANVISA; texto pesquisa a descrição do catálogo (e produto/substância na CMED).
 * Resposta: { itens: SugestaoCatmat[], registros: SugestaoRegistro[] }.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ itens: [], registros: [] });
    }

    const sugestoes = await sugerirMateriais(q.slice(0, 120));
    return NextResponse.json(sugestoes, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("[precos/catmat] Erro:", error);
    return NextResponse.json({ error: "Erro ao buscar sugestões de material" }, { status: 500 });
  }
}
