export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonComVersao } from "@/lib/data-version";
import { normalizarPrincipioAtivo } from "@/lib/principio-ativo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Agrupa por princípio ativo com a contagem de demandas de cada um
    const grupos = await db.demanda.groupBy({
      by: ["principioAtivo"],
      where: { principioAtivo: { not: null } },
      _count: { id: true },
    });

    // Limpa, mescla formas equivalentes (case-insensitive) e soma as contagens
    const mapa = new Map<string, { value: string; count: number }>();

    for (const g of grupos) {
      const limpo = normalizarPrincipioAtivo(g.principioAtivo);
      if (!limpo) continue;

      const chave = limpo.toLowerCase();
      const atual = mapa.get(chave);
      const n = g._count.id;

      if (atual) {
        atual.count += n;
      } else {
        mapa.set(chave, { value: limpo, count: n });
      }
    }

    // Ordena por frequência (desc) e, em empate, alfabético
    const items = Array.from(mapa.values()).sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"),
    );

    return jsonComVersao(request, ["demanda"], async () => ({ items }));
  } catch (error) {
    console.error("[principios-ativos] Erro:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao listar princípios ativos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
