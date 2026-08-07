export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import {
  getSaidasRedmineTabela,
  SAIDAS_REDMINE_FILTROS,
  type SaidasRedmineFiltros,
} from "@/lib/sismat-saidas-redmine-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sismat/saidas/redmine/tabela?grupo=…&regiao=…&uf=…&forma=…&modal=…&sabast=…&status=…&crm=…&oab=…
 * KPIs filtrados + primeiras 500 linhas (por valor desc) do cruzamento.
 * Filtros por igualdade exata; ausentes = sem filtro.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filtros: SaidasRedmineFiltros = {};
    for (const f of SAIDAS_REDMINE_FILTROS) {
      const v = sp.get(f);
      if (v) filtros[f] = v;
    }

    return jsonComVersao(request, ["sismatSaida", "redmineSei"], () =>
      getSaidasRedmineTabela(filtros)
    );
  } catch (error) {
    console.error("[sismat/saidas/redmine/tabela] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao filtrar o cruzamento Saídas × Redmine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
