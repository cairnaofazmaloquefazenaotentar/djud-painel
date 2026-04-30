import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUserSchema, listUsersSchema } from "@/lib/user-schemas";
import { createAuditLog } from "@/lib/audit";
import { hasPermission, hasRole } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const canRead = hasPermission(session.user as any, "usuarios:ler");
    if (!canRead) {
      return NextResponse.json(
        { error: "Sem permissão para listar usuários" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const params = listUsersSchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      busca: searchParams.get("busca"),
      role: searchParams.get("role"),
      organizacaoId: searchParams.get("organizacaoId"),
      ordenarPor: searchParams.get("ordenarPor"),
      ordem: searchParams.get("ordem"),
    });

    const skip = (params.page - 1) * params.pageSize;

    const where: any = {};

    if (params.role) where.role = params.role;
    if (params.organizacaoId) where.organizationId = params.organizacaoId;

    if (params.busca) {
      where.OR = [
        { name: { contains: params.busca, mode: "insensitive" } },
        { email: { contains: params.busca, mode: "insensitive" } },
      ];
    }

    const orderBy: any = {};
    switch (params.ordenarPor) {
      case "nome":
        orderBy.name = params.ordem;
        break;
      case "email":
        orderBy.email = params.ordem;
        break;
      default:
        orderBy.createdAt = params.ordem;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: params.pageSize,
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      data: users,
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
      { error: "Erro ao listar usuários" },
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

    const isAdmin = hasRole(session.user as any, "ADMIN");
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Apenas administradores podem criar usuários" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createUserSchema.parse(body);

    const existingUser = await db.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Usuário com este email já existe" },
        { status: 400 }
      );
    }

    const user = await db.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      userId: session.user.id as string,
      action: "CREATE",
      entity: "User",
      entityId: user.id,
      changes: { email: data.email, name: data.name, role: data.role },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao criar usuário" },
      { status: 500 }
    );
  }
}
