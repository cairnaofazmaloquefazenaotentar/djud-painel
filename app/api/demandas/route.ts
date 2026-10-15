export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDemandaSchema, listDemandaSchema } from "@/lib/schemas";
import { createAuditLog } from "@/lib/audit";
import { aplicarFiltro, contarGruposCatmat, whereDemandas } from "@/lib/demandas-filtro";
import { lerFiltroDemandas, montarBuscaNorm } from "@/lib/demandas-filtro-tipos";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const getString = (key: string) => searchParams.get(key) || undefined;
    const params = listDemandaSchema.parse({
      page: getString("page"),
      pageSize: getString("pageSize"),
      ordenarPor: getString("ordenarPor"),
      ordem: getString("ordem"),
    });

    // Filtro único (lib/demandas-filtro.ts): o mesmo do Dashboard, das
    // exportações e dos relatórios — mesmo recorte, mesmo total.
    const aplicado = await aplicarFiltro(lerFiltroDemandas(searchParams));
    const resumoFiltro = {
      filtroCatmat: aplicado.catmat,
      busca: aplicado.busca,
      medicamento: aplicado.medicamento,
    };
    if (aplicado.vazio) {
      // Código não encontrado: lista vazia com o motivo, não uma tabela muda.
      return NextResponse.json({
        data: [],
        pagination: { page: params.page, pageSize: params.pageSize, total: 0, totalPages: 0 },
        ...resumoFiltro,
      });
    }
    const where = whereDemandas(aplicado);
    const skip = (params.page - 1) * params.pageSize;

    const orderBy: Prisma.DemandaOrderByWithRelationInput[] = [];
    switch (params.ordenarPor) {
      case "atualizado":
        orderBy.push({ atualizadoEm: params.ordem });
        break;
      case "vencimento":
        orderBy.push({ dataVencimento: params.ordem });
        break;
      case "prioridade":
        orderBy.push({ prioridade: params.ordem });
        break;
      case "entrada":
        orderBy.push({ dataEntradaDJUD: { sort: params.ordem, nulls: "last" } });
        break;
      default:
        orderBy.push({ criadoEm: params.ordem });
    }
    // Desempate estável: sem ele, a mesma página pode trazer linhas diferentes.
    orderBy.push({ id: "asc" });

    const [demandas, total, gruposCatmat] = await Promise.all([
      db.demanda.findMany({
        where,
        skip,
        take: params.pageSize,
        orderBy,
        include: {
          organizacao: { select: { id: true, name: true } },
          responsavel: { select: { id: true, name: true, email: true } },
          criadoPor: { select: { id: true, name: true } },
          _count: { select: { attachments: true } },
        },
      }),
      db.demanda.count({ where }),
      // Com código CATMAT: quantas são da apresentação exata e quantas da mesma
      // substância sem apresentação identificada (A5) — a tela mostra os dois.
      contarGruposCatmat({ ...aplicado, filtro: { ...aplicado.filtro, catmatGrupo: null } }),
    ]);

    // A busca normalizada é só índice: não trafega para a tela.
    const demandasWithCount = demandas.map(({ _count, buscaNorm: _busca, ...demanda }) => ({
      ...demanda,
      attachmentCount: _count?.attachments || 0,
    }));

    return NextResponse.json({
      data: demandasWithCount,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
      ...resumoFiltro,
      gruposCatmat,
    });
  } catch (error) {
    // Erro inesperado: mensagem amigável na tela e o detalhe no log (A4).
    console.error("[demandas] GET", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parâmetros inválidos na consulta de demandas" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Não foi possível consultar as demandas agora. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const canCreate = hasPermission(session.user as any, "demandas:criar");
    if (!canCreate) {
      return NextResponse.json(
        { error: "Sem permissão para criar demandas" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createDemandaSchema.parse(body);

    const demanda = await db.demanda.create({
      data: {
        ...data,
        // A coluna da busca acompanha a demanda (A4): sem ela, a nova demanda
        // não seria achada pela busca até a próxima carga.
        buscaNorm: montarBuscaNorm(data),
        criadoPorId: session.user.id as string,
      } as any,
      include: {
        organizacao: { select: { id: true, name: true } },
        responsavel: { select: { id: true, name: true } },
        criadoPor: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      userId: session.user.id as string,
      action: "CREATE",
      entity: "Demanda",
      entityId: demanda.id,
      changes: data,
    });

    return NextResponse.json(demanda, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao criar demanda" },
      { status: 500 }
    );
  }
}
