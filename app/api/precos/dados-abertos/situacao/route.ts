export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { resolverItem } from "@/lib/pesquisa-preco";
import { situacaoColetas } from "@/lib/dados-abertos/situacao";
import { vinculosEmCache } from "@/lib/dados-abertos/pncp-vinculo";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precos/dados-abertos/situacao?codigo=410020
//
// O que a tela precisa para o painel "Dados abertos" de um CATMAT: a última
// coleta de cada origem (e se ainda vale — P19) e as compras do Compras.gov.br
// ainda sem vínculo com o PNCP (P22).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const codigo = request.nextUrl.searchParams.get("codigo")?.trim() ?? "";
    const item = codigo ? await resolverItem(codigo) : null;
    if (!item?.catmat) {
      return NextResponse.json({ catmat: null, indisponivel: false, porOrigem: null, vinculosPendentes: [] });
    }
    const situacao = await situacaoColetas(item.catmat);
    let vinculosPendentes: string[] = [];
    if (!situacao.indisponivel && situacao.porOrigem.COMPRASGOV.registros > 0) {
      const compras = await db.dadosAbertosPreco.findMany({
        where: { codigoCatmat: item.catmat, origem: "COMPRASGOV", idCompra: { not: null } },
        select: { idCompra: true },
        distinct: ["idCompra"],
      });
      const ids = compras.map((c) => c.idCompra as string);
      const cache = await vinculosEmCache(ids);
      vinculosPendentes = ids.filter((i) => !cache.has(i));
    }
    return NextResponse.json({ catmat: item.catmat, ...situacao, vinculosPendentes });
  } catch (error) {
    console.error("[dados-abertos/situacao]", error);
    return NextResponse.json({ error: "Erro ao consultar a situação dos dados abertos" }, { status: 500 });
  }
}
