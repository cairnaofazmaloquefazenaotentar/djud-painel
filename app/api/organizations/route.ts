export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page     = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(50, parseInt(searchParams.get("pageSize") || "20"));
    const busca    = searchParams.get("busca") || "";
    const showAll  = searchParams.get("all") === "true"; // Para dropdowns

    if (showAll) {
      // Retorno simplificado para uso em dropdowns
      const organizations = await db.organization.findMany({
        where: { active: true },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ data: organizations });
    }

    const where: any = {};
    if (busca) where.name = { contains: busca, mode: "insensitive" };

    const skip = (page - 1) * pageSize;

    const [organizations, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { users: true, demandas: true } },
        },
      }),
      db.organization.count({ where }),
    ]);

    return NextResponse.json({
      data: organizations.map((org) => ({
        ...org,
        usersCount:   org._count.users,
        demandasCount: org._count.demandas,
        _count: undefined,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar organizações" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!hasPermission(session.user as any, "users:write")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json();
    const data = createOrgSchema.parse(body);

    const org = await db.organization.create({
      data: {
        name:    data.name,
        slug:    data.slug,
        logoUrl: data.logoUrl || null,
        active:  data.active,
      },
    });

    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao criar organização" }, { status: 500 });
  }
}
