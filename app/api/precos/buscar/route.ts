export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { classificarCodigo, pesquisarPrecos } from "@/lib/pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET  /api/precos/buscar?codigo=267140&unidade=COMPRIMIDO
 *        [&uf=SP][&fornecedor=…][&fabricante=…][&cnpjComprador=…]
 * POST /api/precos/buscar  { codigo, unidade, uf, fornecedor, fabricante,
 *                            cnpjComprador, exclusoes, orcamentos }
 *
 * Pesquisa consolidada de preços (CMED, BPS, SIASG e PNCP) dirigida
 * pelos três filtros obrigatórios: código do material (CATMAT de até 6 dígitos
 * ou registro ANVISA de 13), descrição CATMAT (implícita no código) e unidade
 * de fornecimento (normalizada — ver lib/pesquisa-preco.ts).
 *
 * UF, fornecedor, fabricante e CNPJ do comprador são recortes opcionais; texto
 * com menos de 2 caracteres e CNPJ com menos de 8 dígitos são ignorados em
 * normalizarFiltros(). Resposta: ResultadoPesquisa.
 *
 * O POST existe para a tela de curadoria: ela precisa ver o efeito das
 * exclusões justificadas e dos orçamentos ANTES de emitir o relatório, e a
 * recontagem tem de ser a mesma do servidor — refazê-la no navegador
 * arriscaria mostrar um número e imprimir outro. Listas grandes de exclusões
 * também não caberiam bem na query string.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return responder({
    codigo: String(body?.codigo ?? "").trim(),
    unidade: String(body?.unidade ?? "").trim(),
    uf: body?.uf ? String(body.uf).trim().toUpperCase() : null,
    filtros: {
      fornecedor: body?.fornecedor ?? null,
      fabricante: body?.fabricante ?? null,
      cnpjComprador: body?.cnpjComprador ?? null,
    },
    exclusoes: body?.exclusoes ?? [],
    orcamentos: body?.orcamentos ?? [],
  });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return responder({
    codigo: sp.get("codigo")?.trim() ?? "",
    unidade: sp.get("unidade")?.trim() ?? "",
    uf: sp.get("uf")?.trim().toUpperCase() || null,
    filtros: {
      fornecedor: sp.get("fornecedor"),
      fabricante: sp.get("fabricante"),
      cnpjComprador: sp.get("cnpjComprador"),
    },
  });
}

async function responder(p: Parameters<typeof pesquisarPrecos>[0]): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (!classificarCodigo(p.codigo)) {
      return NextResponse.json(
        { error: "Informe o código do material: CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos)" },
        { status: 400 }
      );
    }
    if (!p.unidade) {
      return NextResponse.json({ error: "Informe a unidade de fornecimento" }, { status: 400 });
    }
    if (p.uf && !/^[A-Z]{2}$/.test(p.uf)) {
      return NextResponse.json({ error: "UF inválida" }, { status: 400 });
    }

    const resultado = await pesquisarPrecos(p);
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
