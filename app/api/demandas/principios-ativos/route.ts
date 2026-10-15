export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonComVersao } from "@/lib/data-version";
import { normalizarPrincipioAtivo } from "@/lib/principio-ativo";
import { limparSubstancia, radicalSubstancia } from "@/lib/substancia";
import { SEPARADOR_MULTIVALOR } from "@/lib/demandas-filtro-tipos";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demandas/principios-ativos — sugestões do campo "Medicamento" (B3).
//
// Substância CANÔNICA: as grafias do Redmine ("Eltrombopag", "Eltrombopague",
// "ELTROMBOPAGUE OLAMINA") viram uma entrada só, pelo mesmo radical que o
// filtro de medicamento procura (lib/substancia.ts). O rótulo é a grafia mais
// frequente; a contagem é de demandas (fora da lixeira) — uma demanda com
// "A | B" conta uma vez em A e uma em B.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    return jsonComVersao(request, ["demanda"], async () => {
      const grupos = await db.demanda.groupBy({
        by: ["principioAtivo"],
        where: { principioAtivo: { not: null }, deletedAt: null },
        _count: { id: true },
      });

      const porRadical = new Map<string, { count: number; grafias: Map<string, number> }>();
      for (const g of grupos) {
        const limpo = normalizarPrincipioAtivo(g.principioAtivo);
        if (!limpo) continue;
        // Os itens de uma mesma demanda podem cair no mesmo radical ("A | A sódica").
        const radicais = new Map<string, string>();
        for (const item of limpo.split(SEPARADOR_MULTIVALOR)) {
          const nome = limparSubstancia(item.trim());
          const r = radicalSubstancia(nome);
          if (r && !radicais.has(r)) radicais.set(r, nome);
        }
        for (const [r, nome] of radicais) {
          const atual = porRadical.get(r) ?? { count: 0, grafias: new Map<string, number>() };
          atual.count += g._count.id;
          atual.grafias.set(nome, (atual.grafias.get(nome) ?? 0) + g._count.id);
          porRadical.set(r, atual);
        }
      }

      const items = Array.from(porRadical.entries())
        .map(([radical, d]) => ({
          value: Array.from(d.grafias.entries()).sort((a, b) => b[1] - a[1])[0][0],
          count: d.count,
          radical,
        }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"));
      return { items };
    });
  } catch (error) {
    console.error("[principios-ativos] Erro:", error);
    return NextResponse.json({ error: "Erro ao listar os medicamentos" }, { status: 500 });
  }
}
