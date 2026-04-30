import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const listLogsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  userId: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  busca: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const isAdminOrManager = hasRole(session.user as any, "ADMIN") ||
      hasRole(session.user as any, "MANAGER");
    if (!isAdminOrManager) {
      return NextResponse.json(
        { error: "Acesso restrito a administradores e gerenciadores" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const params = listLogsSchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      userId: searchParams.get("userId"),
      action: searchParams.get("action"),
      entity: searchParams.get("entity"),
      entityId: searchParams.get("entityId"),
      dataInicio: searchParams.get("dataInicio"),
      dataFim: searchParams.get("dataFim"),
      busca: searchParams.get("busca"),
    });

    const skip = (params.page - 1) * params.pageSize;

    const where: any = {};

    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = { equals: params.action, mode: "insensitive" };
    if (params.entity) where.entity = { equals: params.entity, mode: "insensitive" };
    if (params.entityId) where.entityId = params.entityId;

    if (params.dataInicio || params.dataFim) {
      where.createdAt = {};
      if (params.dataInicio) where.createdAt.gte = new Date(params.dataInicio);
      if (params.dataFim) {
        const end = new Date(params.dataFim);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (params.busca) {
      where.OR = [
        { entity: { contains: params.busca, mode: "insensitive" } },
        { entityId: { contains: params.busca, mode: "insensitive" } },
        { user: { name: { contains: params.busca, mode: "insensitive" } } },
        { user: { email: { contains: params.busca, mode: "insensitive" } } },
      ];
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip,
        take: params.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Erro ao listar logs" },
      { status: 500 }
    );
  }
}
