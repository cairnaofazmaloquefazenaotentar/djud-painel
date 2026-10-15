export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { escolhaGravada, paraDTO, parametrosDoItem } from "@/lib/cesta";
import { MAX_ITENS_CESTA, QUANTIDADE_MAX, orcamentoSchema } from "@/lib/cesta-schemas";
import { MAX_ORCAMENTOS } from "@/lib/pesquisa-preco-curadoria";
import { classificarCodigo, hojeBrasilia, pesquisarPrecos } from "@/lib/pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import "@/lib/zod-pt";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/precos/cesta/preco-informado — inclui um preço informado (cotação,
// mídia, nota fiscal ou contratação similar) num item da cesta SEM pesquisar
// antes (pedido da DLOG: botão ao lado da Cesta). O item é o do código +
// unidade + UF: se já está na cesta, o preço é ACRESCENTADO aos que ele tem
// (o POST da cesta substitui a lista); se não está, o item entra com ele.
// Depois o preço exibido na cesta é refeito com o preço novo.
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  codigo: z.string().trim().min(1, "Informe o código do material"),
  unidade: z.string().trim().min(1, "Informe a unidade de fornecimento"),
  uf: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = (v ?? "").trim().toUpperCase();
      return s === "" || s === "TODOS" ? null : s;
    })
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), { message: "UF inválida" }),
  /** Só usada quando o item ainda não está na cesta. */
  quantidade: z.coerce.number().int().min(1).max(QUANTIDADE_MAX).default(1),
  orcamento: orcamentoSchema,
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const userId = session.user.id as string;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const { codigo, unidade, uf, quantidade, orcamento } = parsed.data;
    if (!classificarCodigo(codigo)) {
      return NextResponse.json({ error: "Código inválido: informe um CATMAT ou um registro ANVISA" }, { status: 400 });
    }

    // Identifica o item como a cesta o grava (código e unidade normalizados).
    const resultado = await pesquisarPrecos({ codigo, unidade, uf, orcamentos: [{ ...orcamento, id: "novo" }] });
    if (!resultado) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }
    const chave = { userId, codigo: resultado.item.codigo, unidade: resultado.unidade, uf: resultado.uf };
    const existente = await db.cestaItem.findFirst({ where: chave, include: { _count: { select: { orcamentos: true } } } });

    let itemId: string;
    if (existente) {
      if (existente._count.orcamentos >= MAX_ORCAMENTOS) {
        return NextResponse.json({ error: `Máximo de ${MAX_ORCAMENTOS} preços informados por item.` }, { status: 409 });
      }
      await db.cestaOrcamento.create({ data: { ...orcamento, cestaItemId: existente.id } });
      itemId = existente.id;
    } else {
      if ((await db.cestaItem.count({ where: { userId } })) >= MAX_ITENS_CESTA) {
        return NextResponse.json(
          { error: `A cesta comporta no máximo ${MAX_ITENS_CESTA} itens. Gere o relatório ou remova itens antes.` },
          { status: 409 }
        );
      }
      const criado = await db.cestaItem.create({
        data: {
          ...chave,
          tipo: resultado.item.tipo,
          catmat: resultado.item.catmat,
          descricao: resultado.item.descricao,
          quantidade,
          exclusoes: [],
          orcamentos: { create: [orcamento] },
        },
      });
      itemId = criado.id;
    }

    // Preço exibido na cesta, refeito com o preço novo e o resto da curadoria do item.
    const atual = await db.cestaItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { orcamentos: { orderBy: { criadoEm: "asc" } } },
    });
    const dto = paraDTO(atual);
    const refeito = await pesquisarPrecos(parametrosDoItem(dto, hojeBrasilia(), escolhaGravada(dto)));
    const rec = refeito?.recomendacao;
    const final = rec
      ? await db.cestaItem.update({
          where: { id: itemId },
          data: {
            precoReferencia: rec.precoReferencia,
            limitePmvg: rec.limitePmvg,
            precoFinal: rec.precoFinal,
            calculadoEm: new Date(),
          },
          include: { orcamentos: { orderBy: { criadoEm: "asc" } } },
        })
      : atual;
    return NextResponse.json({ item: paraDTO(final), novoItem: !existente }, { status: existente ? 200 : 201 });
  } catch (error) {
    console.error("[precos/cesta/preco-informado]", error);
    return NextResponse.json({ error: "Erro ao incluir o preço informado na cesta" }, { status: 500 });
  }
}
