export const runtime = "nodejs";
export const maxDuration = 60;
// Se a coleta falhar só na Vercel (diagnóstico 3.7.3), testar
// `export const preferredRegion = "gru1"` antes de concluir que há bloqueio.

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { resolverItem } from "@/lib/pesquisa-preco";
import { coletarPagina } from "@/lib/dados-abertos/coleta";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/precos/dados-abertos/coletar { codigo, origem, pagina, coletaId }
//
// Coleta UMA página de uma origem de dados abertos (Compras.gov.br, BPS ou
// atas) para um CATMAT e grava em DadosAbertosPreco. A tela repete a chamada
// com `proximaPagina` até vir null, espaçando as chamadas e obedecendo
// `aguardarMs` num 429 — a função nunca dorme esperando a cota.
// Relatórios nunca chamam esta rota: a emissão usa o que já foi coletado.
// ─────────────────────────────────────────────────────────────────────────────

const corpoSchema = z.object({
  codigo: z.string().trim().min(1),
  origem: z.enum(["COMPRASGOV", "BPS", "ARP_ITEM"]),
  pagina: z.coerce.number().int().min(1).max(2000).default(1),
  coletaId: z.string().trim().min(1).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const userId = session.user.id as string;
    const limite = rateLimit(`dados-abertos:coletar:${userId}`, { limit: 80, windowMs: 60_000 });
    if (!limite.success) return rateLimitResponse(limite);

    const parsed = corpoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const { codigo, origem, pagina, coletaId } = parsed.data;

    // A coleta é por CATMAT; registro ANVISA usa o CATMAT associado.
    const digitos = codigo.replace(/\D/g, "");
    let catmat: string | null = digitos.length <= 7 ? digitos.replace(/^0+/, "") || null : null;
    if (!catmat) {
      const item = await resolverItem(codigo);
      catmat = item?.catmat ?? null;
    }
    if (!catmat) {
      return NextResponse.json(
        { error: "A coleta de dados abertos é por CATMAT; este registro ANVISA não tem CATMAT associado." },
        { status: 400 }
      );
    }

    const r = await coletarPagina({ origem, catmat, pagina, coletaId: coletaId ?? null, usuarioId: userId });

    if (r.proximaPagina === null && (r.status === "OK" || r.status === "PARCIAL")) {
      await db.auditLog.create({
        data: {
          action: "IMPORT",
          entity: "DadosAbertosColeta",
          entityId: r.coletaId,
          userId,
          metadata: { origem, catmat, status: r.status, esperados: r.esperados, baixados: r.baixados, paginas: r.pagina },
        },
      });
    }
    return NextResponse.json(r);
  } catch (error) {
    console.error("[dados-abertos/coletar]", error);
    const msg = (error as Error).message ?? "";
    if (/DadosAbertos|does not exist|relation/i.test(msg)) {
      return NextResponse.json(
        { error: "Tabelas de dados abertos ainda não criadas: rode scripts/create_dadosabertos_tables.py --confirm." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Erro ao coletar dados abertos" }, { status: 500 });
  }
}
