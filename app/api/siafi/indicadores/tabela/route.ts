export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getSiafiIndicadoresTabela } from "@/lib/siafi-indicadores-metrics";
import { NextResponse } from "next/server";
import type { SiafiIndicadoresFiltros } from "@/lib/siafi-indicadores-metrics";

/**
 * GET /api/siafi/indicadores/tabela
 * KPIs + primeiras 500 linhas filtradas do cruzamento Demanda × SiafiPagamento.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filtros: SiafiIndicadoresFiltros = {};
    for (const key of ["grupo", "regiao", "uf", "status", "crm", "oab"] as const) {
      const v = searchParams.get(key);
      if (v) filtros[key] = v;
    }

    const tabela = await getSiafiIndicadoresTabela(filtros);
    return NextResponse.json(tabela);
  } catch (error) {
    console.error("[siafi/indicadores/tabela] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao filtrar os indicadores de valor SIAFI";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
