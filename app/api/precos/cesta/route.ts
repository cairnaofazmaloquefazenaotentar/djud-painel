export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { listarCesta, paraDTO, resumir } from "@/lib/cesta";
import { adicionarItemCestaSchema, MAX_ITENS_CESTA, QUANTIDADE_MAX } from "@/lib/cesta-schemas";
import { classificarCodigo, pesquisarPrecos } from "@/lib/pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Cesta da Pesquisa de Preços — coleção do usuário logado (lib/cesta.ts).
//
// GET    /api/precos/cesta   → CestaResumo
// POST   /api/precos/cesta   → adiciona o item (ou soma a quantidade, se já está)
// DELETE /api/precos/cesta   → esvazia a cesta
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const cesta = await listarCesta(session.user.id as string);
    return NextResponse.json(cesta);
  } catch (error) {
    console.error("[precos/cesta] GET", error);
    return NextResponse.json({ error: "Erro ao carregar a cesta" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const userId = session.user.id as string;

    const body = await request.json().catch(() => null);
    const parsed = adicionarItemCestaSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const { codigo, unidade, uf, quantidade, observacao } = parsed.data;

    if (!classificarCodigo(codigo)) {
      return NextResponse.json(
        { error: "Informe o código do material: CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos)" },
        { status: 400 }
      );
    }

    // Refaz a pesquisa antes de gravar: garante que o código/unidade resolvem e
    // dá o snapshot de preço que a cesta exibe até a emissão do relatório.
    const resultado = await pesquisarPrecos({ codigo, unidade, uf });
    if (!resultado) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }

    const existente = await db.cestaItem.findFirst({
      where: {
        userId,
        codigo: resultado.item.codigo,
        unidade: resultado.unidade,
        uf: resultado.uf,
      },
    });

    const precos = {
      precoReferencia: resultado.recomendacao.precoReferencia,
      limitePmvg: resultado.recomendacao.limitePmvg,
      precoFinal: resultado.recomendacao.precoFinal,
      calculadoEm: new Date(),
    };

    if (existente) {
      const atualizado = await db.cestaItem.update({
        where: { id: existente.id },
        data: {
          quantidade: Math.min(existente.quantidade + quantidade, QUANTIDADE_MAX),
          ...(observacao === undefined ? {} : { observacao }),
          ...precos,
        },
      });
      return NextResponse.json({ item: paraDTO(atualizado), duplicado: true });
    }

    const total = await db.cestaItem.count({ where: { userId } });
    if (total >= MAX_ITENS_CESTA) {
      return NextResponse.json(
        {
          error: `A cesta comporta no máximo ${MAX_ITENS_CESTA} itens. Gere o relatório ou remova itens antes de adicionar outro.`,
        },
        { status: 409 }
      );
    }

    const criado = await db.cestaItem.create({
      data: {
        userId,
        codigo: resultado.item.codigo,
        tipo: resultado.item.tipo,
        catmat: resultado.item.catmat,
        descricao: resultado.item.descricao,
        unidade: resultado.unidade,
        uf: resultado.uf,
        quantidade,
        observacao: observacao ?? null,
        ...precos,
      },
    });

    return NextResponse.json({ item: paraDTO(criado), duplicado: false }, { status: 201 });
  } catch (error) {
    console.error("[precos/cesta] POST", error);
    return NextResponse.json({ error: "Erro ao adicionar o item à cesta" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const apagados = await db.cestaItem.deleteMany({ where: { userId: session.user.id as string } });
    return NextResponse.json({ ...resumir([]), removidos: apagados.count });
  } catch (error) {
    console.error("[precos/cesta] DELETE", error);
    return NextResponse.json({ error: "Erro ao esvaziar a cesta" }, { status: 500 });
  }
}
