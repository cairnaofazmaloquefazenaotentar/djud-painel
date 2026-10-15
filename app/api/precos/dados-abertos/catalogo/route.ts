export const runtime = "nodejs";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { garantirItemCatalogo } from "@/lib/dados-abertos/coleta";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/precos/dados-abertos/catalogo { codigo }
//
// CATMAT que ainda não está no catálogo local (CatmatItem é a planilha das 16
// classes; itens novos, como o 640532 — eplontersena —, chegam antes nela):
// busca no catálogo oficial (/modulo-material/4_consultarItemMaterial) e grava,
// para a pesquisa e a coleta funcionarem. A próxima carga da planilha
// substitui a linha pelo dado oficial dela.
// ─────────────────────────────────────────────────────────────────────────────

const corpoSchema = z.object({ codigo: z.string().trim().regex(/^\d{1,7}$/, "Informe um CATMAT (só dígitos)") });

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const parsed = corpoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const catmat = parsed.data.codigo.replace(/^0+/, "");
    const r = await garantirItemCatalogo(catmat);
    if (r === "nao_encontrado") {
      return NextResponse.json({ error: `CATMAT ${catmat} não existe no catálogo oficial do Compras.gov.br` }, { status: 404 });
    }
    if (r === "erro") {
      return NextResponse.json({ error: "O catálogo do Compras.gov.br não respondeu; tente de novo em instantes" }, { status: 502 });
    }
    const item = await db.catmatItem.findUnique({ where: { codigoItem: catmat } });
    return NextResponse.json({
      catmat,
      situacao: r,
      item: item && {
        codigo: item.codigoItem,
        descricao: item.descricaoItem,
        nomePdm: item.nomePdm,
        codigoClasse: item.codigoClasse,
        nomeClasse: item.nomeClasse,
      },
    });
  } catch (error) {
    console.error("[dados-abertos/catalogo]", error);
    return NextResponse.json({ error: "Erro ao consultar o catálogo" }, { status: 500 });
  }
}
