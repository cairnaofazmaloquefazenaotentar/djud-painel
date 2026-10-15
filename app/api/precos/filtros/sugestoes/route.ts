export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ROTULO_FILTRO, type CampoFiltro } from "@/lib/pesquisa-preco-filtros";
import { sugerirValoresFiltro } from "@/lib/pesquisa-preco-sugestoes";
import { NextRequest, NextResponse } from "next/server";

const CAMPOS = Object.keys(ROTULO_FILTRO) as CampoFiltro[];

/**
 * GET /api/precos/filtros/sugestoes?campo=fornecedor|fabricante|cnpjComprador
 *     &codigo=<CATMAT ou registro>&unidade=<unidade normalizada>&uf=&q=<trecho>
 *
 * Autocomplete dos filtros de "Mais filtros": valores que existem nas bases
 * para o item e a unidade escolhidos, com a contagem de registros e as bases em
 * que aparecem. Sem `q`, os mais frequentes. Resposta: RespostaSugestoesFiltro.
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
    const campo = sp.get("campo") as CampoFiltro | null;
    const codigo = sp.get("codigo")?.replace(/\D/g, "") ?? "";
    const unidade = sp.get("unidade")?.trim() ?? "";
    const uf = sp.get("uf")?.trim().toUpperCase() || null;
    if (!campo || !CAMPOS.includes(campo)) {
      return NextResponse.json({ error: "Campo de filtro inválido" }, { status: 400 });
    }
    if (!codigo || !unidade) {
      return NextResponse.json({ valores: [], motivo: "Escolha o material e a unidade para ver as sugestões." });
    }
    if (uf && !/^[A-Z]{2}$/.test(uf)) {
      return NextResponse.json({ error: "UF inválida" }, { status: 400 });
    }

    const resposta = await sugerirValoresFiltro({ campo, codigo, unidade, uf, q: sp.get("q") ?? "" });
    return NextResponse.json(resposta, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("[precos/filtros/sugestoes] Erro:", error);
    return NextResponse.json({ error: "Erro ao buscar sugestões" }, { status: 500 });
  }
}
