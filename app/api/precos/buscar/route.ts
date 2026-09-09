export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { classificarCodigo, pesquisarPrecos } from "@/lib/pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/precos/buscar?codigo=267140&unidade=COMPRIMIDO[&uf=SP]
 *
 * Pesquisa consolidada de preços (CMED, BPS, SIASG, PNCP e ComprasGov) dirigida
 * pelos três filtros obrigatórios: código do material (CATMAT de até 6 dígitos
 * ou registro ANVISA de 13), descrição CATMAT (implícita no código) e unidade
 * de fornecimento (normalizada — ver lib/pesquisa-preco.ts). Resposta:
 * ResultadoPesquisa.
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

    const sp = request.nextUrl.searchParams;
    const codigo = sp.get("codigo")?.trim() ?? "";
    const unidade = sp.get("unidade")?.trim() ?? "";
    const uf = sp.get("uf")?.trim().toUpperCase() || null;

    if (!classificarCodigo(codigo)) {
      return NextResponse.json(
        { error: "Informe o código do material: CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos)" },
        { status: 400 }
      );
    }
    if (!unidade) {
      return NextResponse.json({ error: "Informe a unidade de fornecimento" }, { status: 400 });
    }
    if (uf && !/^[A-Z]{2}$/.test(uf)) {
      return NextResponse.json({ error: "UF inválida" }, { status: 400 });
    }

    const resultado = await pesquisarPrecos({ codigo, unidade, uf });
    if (!resultado) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[precos/buscar] Erro:", error);
    return NextResponse.json({ error: "Erro ao realizar pesquisa" }, { status: 500 });
  }
}
