export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { escolherLista, listarCompetencias } from "@/lib/cmed";
import { hojeBrasilia } from "@/lib/pesquisa-preco-periodo";
import { NextResponse } from "next/server";

/**
 * GET /api/precos/cmed/competencias
 *
 * Listas mensais da CMED carregadas (mais recente primeiro), para o seletor
 * "Lista CMED" da Pesquisa de Preços, e `vigente`: a última publicada até
 * hoje — a que os relatórios usam. Sem listas mensais, `competencias` vem
 * vazio e a pesquisa segue com a tabela CMED única (PrecoCmed).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const competencias = await listarCompetencias();
    const vigente = escolherLista(competencias, hojeBrasilia(), null);
    return NextResponse.json(
      { competencias, vigente: vigente?.competencia ?? null },
      { headers: { "Cache-Control": "private, no-cache" } }
    );
  } catch (error) {
    console.error("[precos/cmed/competencias] Erro:", error);
    return NextResponse.json({ error: "Erro ao listar as listas CMED" }, { status: 500 });
  }
}
