export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { filtroParaQuery, lerFiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import "@/lib/zod-pt";

// ─────────────────────────────────────────────────────────────────────────────
// Visões salvas da lista de Demandas (P4): o filtro da URL com um nome, por
// usuário, no modelo UserView. A querystring gravada é a CANÔNICA
// (filtroParaQuery): nomes antigos de parâmetro não se perpetuam.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VISOES = 50;

const criarSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome à visão").max(100),
  querystring: z.string().max(4000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const visoes = await db.userView.findMany({
    where: { userId: session.user.id as string },
    orderBy: { name: "asc" },
    select: { id: true, name: true, querystring: true, updatedAt: true },
  });
  return NextResponse.json({ visoes });
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const userId = session.user.id as string;
    const parsed = criarSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const querystring = filtroParaQuery(lerFiltroDemandas(new URLSearchParams(parsed.data.querystring))).toString();

    // Mesmo nome = atualiza a visão em vez de duplicar.
    const existente = await db.userView.findFirst({ where: { userId, name: parsed.data.nome } });
    if (existente) {
      const visao = await db.userView.update({ where: { id: existente.id }, data: { querystring } });
      return NextResponse.json({ visao });
    }
    if ((await db.userView.count({ where: { userId } })) >= MAX_VISOES) {
      return NextResponse.json({ error: `Limite de ${MAX_VISOES} visões salvas` }, { status: 400 });
    }
    const visao = await db.userView.create({ data: { userId, name: parsed.data.nome, querystring } });
    return NextResponse.json({ visao }, { status: 201 });
  } catch (error) {
    console.error("[demandas/visoes] POST", error);
    return NextResponse.json({ error: "Erro ao salvar a visão" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const r = await db.userView.deleteMany({ where: { id, userId: session.user.id as string } });
  if (!r.count) return NextResponse.json({ error: "Visão não encontrada" }, { status: 404 });
  return NextResponse.json({ removida: id });
}
