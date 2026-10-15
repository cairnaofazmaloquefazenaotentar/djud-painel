export const runtime = "nodejs";
export const maxDuration = 60;

import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { consultarVinculo, gravarVinculo, vinculosEmCache } from "@/lib/dados-abertos/pncp-vinculo";
import { normalizarIdCompra } from "@/lib/dados-abertos/mapear";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/precos/dados-abertos/vincular-pncp { idsCompra: string[] }
//
// Liga até 20 compras (idCompra) à contratação no PNCP (P22) — duas consultas
// por compra (contratação e itens), dentro da cota do Compras.gov.br. As já
// vinculadas (ou "não encontradas" há menos de 30 dias) são puladas. Num 429,
// devolve `aguardarMs` e a lista `pendentes`, que a tela reenvia depois.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_POR_CHAMADA = 20;
const corpoSchema = z.object({ idsCompra: z.array(z.string().trim().min(1)).min(1).max(MAX_POR_CHAMADA) });

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const limite = rateLimit(`dados-abertos:vincular:${session.user.id}`, { limit: 30, windowMs: 60_000 });
    if (!limite.success) return rateLimitResponse(limite);

    const parsed = corpoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: `Envie de 1 a ${MAX_POR_CHAMADA} idCompra por chamada` }, { status: 400 });
    }
    const ids = Array.from(new Set(parsed.data.idsCompra.map((i) => normalizarIdCompra(i)).filter((i): i is string => !!i)));
    const cache = await vinculosEmCache(ids);

    let encontrados = 0;
    let naoEncontrados = 0;
    const erros: Array<{ idCompra: string; erro: string }> = [];
    const pendentes = ids.filter((i) => !cache.has(i));
    while (pendentes.length) {
      const id = pendentes[0];
      const r = await consultarVinculo(id);
      if (r.tipo === "aguardar") {
        return NextResponse.json({ encontrados, naoEncontrados, erros, pendentes, aguardarMs: r.aguardarMs });
      }
      pendentes.shift();
      if (r.tipo !== "ok") {
        erros.push({ idCompra: id, erro: r.detalhe });
        continue;
      }
      await gravarVinculo(r.dados);
      if (r.dados.encontrado) encontrados += 1;
      else naoEncontrados += 1;
    }
    return NextResponse.json({ encontrados, naoEncontrados, emCache: cache.size, erros, pendentes: [] });
  } catch (error) {
    console.error("[dados-abertos/vincular-pncp]", error);
    return NextResponse.json({ error: "Erro ao vincular compras ao PNCP" }, { status: 500 });
  }
}
