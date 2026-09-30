export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { mapearUnidades, resolverItem } from "@/lib/pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/precos/catmat/[codigo]
 *
 * Detalhe do item escolhido (CATMAT ou registro ANVISA) e as unidades de
 * fornecimento disponíveis nas fontes para esse código — opções do terceiro
 * filtro obrigatório. Resposta: { item: ItemPesquisa, unidades: UnidadeOpcao[] }.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const item = await resolverItem(decodeURIComponent(codigo ?? ""));
    if (!item) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }

    const { opcoes } = await mapearUnidades(item);
    return NextResponse.json(
      { item, unidades: opcoes },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (error) {
    console.error("[precos/catmat/[codigo]] Erro:", error);
    return NextResponse.json({ error: "Erro ao carregar o item" }, { status: 500 });
  }
}
