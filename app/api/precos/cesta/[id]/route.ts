export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { paraDTO } from "@/lib/cesta";
import { atualizarItemCestaSchema } from "@/lib/cesta-schemas";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Item da cesta — PATCH (quantidade/observação) e DELETE.
// O `where` sempre inclui o userId: ninguém mexe na cesta de outro usuário.
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = atualizarItemCestaSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const { quantidade, observacao, exclusoes, orcamentos } = parsed.data;

    const item = await db.cestaItem.findFirst({
      where: { id, userId: session.user.id as string },
    });
    if (!item) {
      return NextResponse.json({ error: "Item não encontrado na sua cesta" }, { status: 404 });
    }

    // Orçamentos são substituídos em bloco (ver atualizarItemCestaSchema). Em
    // transação para o item nunca ficar sem a lista antiga e sem a nova.
    const atualizado = await db.$transaction(async (tx) => {
      if (orcamentos !== undefined) {
        await tx.cestaOrcamento.deleteMany({ where: { cestaItemId: item.id } });
        if (orcamentos.length) {
          await tx.cestaOrcamento.createMany({
            data: orcamentos.map((o) => ({ ...o, cestaItemId: item.id })),
          });
        }
      }
      const linha = await tx.cestaItem.update({
        where: { id: item.id },
        data: {
          ...(quantidade === undefined ? {} : { quantidade }),
          ...(observacao === undefined ? {} : { observacao }),
          // Lista vazia apaga a curadoria; `undefined` deixa como está.
          ...(exclusoes === undefined ? {} : { exclusoes }),
        },
        include: { orcamentos: { orderBy: { criadoEm: "asc" } } },
      });
      return linha;
    });

    return NextResponse.json({ item: paraDTO(atualizado) });
  } catch (error) {
    console.error("[precos/cesta/[id]] PATCH", error);
    return NextResponse.json({ error: "Erro ao atualizar o item" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const apagados = await db.cestaItem.deleteMany({
      where: { id, userId: session.user.id as string },
    });
    if (apagados.count === 0) {
      return NextResponse.json({ error: "Item não encontrado na sua cesta" }, { status: 404 });
    }

    return NextResponse.json({ removido: id });
  } catch (error) {
    console.error("[precos/cesta/[id]] DELETE", error);
    return NextResponse.json({ error: "Erro ao remover o item" }, { status: 500 });
  }
}
