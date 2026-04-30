import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDemandaSchema, listDemandaSchema } from "@/lib/schemas";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const params = listDemandaSchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status"),
      prioridade: searchParams.get("prioridade"),
      organizacaoId: searchParams.get("organizacaoId"),
      busca: searchParams.get("busca"),
      ordenarPor: searchParams.get("ordenarPor"),
      ordem: searchParams.get("ordem"),
    });

    const skip = (params.page - 1) * params.pageSize;

    const where: any = {};

    if (params.status) where.status = params.status;
    if (params.prioridade) where.prioridade = params.prioridade;
    if (params.organizacaoId) where.organizacaoId = params.organizacaoId;

    if (params.busca) {
      where.OR = [
        { numero: { contains: params.busca, mode: "insensitive" } },
        { titulo: { contains: params.busca, mode: "insensitive" } },
        { descricao: { contains: params.busca, mode: "insensitive" } },
      ];
    }

    const orderBy: any = {};
    switch (params.ordenarPor) {
      case "criado":
        orderBy.criadoEm = params.ordem;
        break;
      case "atualizado":
        orderBy.atualizadoEm = params.ordem;
        break;
      case "vencimento":
        orderBy.dataVencimento = params.ordem;
        break;
      case "prioridade":
        orderBy.prioridade = params.ordem === "asc" ? "asc" : "desc";
        break;
      default:
        orderBy.criadoEm = "desc";
    }

    const [demandas, total] = await Promise.all([
      db.demanda.findMany({
        where,
        skip,
        take: params.pageSize,
        orderBy,
        include: {
          organizacao: { select: { id: true, name: true } },
          responsavel: { select: { id: true, name: true, email: true } },
          criadoPor: { select: { id: true, name: true } },
        },
      }),
      db.demanda.count({ where }),
    ]);

    return NextResponse.json({
      data: demandas,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao listar demandas" },
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
