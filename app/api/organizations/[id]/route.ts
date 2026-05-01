export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateOrgSchema = z.object({
  name:    z.string().min(2).optional(),
  slug:    z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  active:  z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const org = await db.organization.findUnique({
      where: { id },
      include: { _count: { select: { users: true, demandas: true } } },
    });

    if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

    return NextResponse.json({
      ...org,
      usersCount:    org._count.users,
      demandasCount: org._count.demandas,
    });
  } catch {
    return NextResponse.json({ error: "Erro ao buscar organização" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session.user as any, "users:write")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json();
    const data = updateOrgSchema.parse(body);

    const org = await db.organization.update({
      where: { id },
      data: {
        ...(data.name    !== undefined && { name:    data.name }),
        ...(data.slug    !== undefined && { slug:    data.slug }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl || null }),
        ...(data.active  !== undefined && { active:  data.active }),
      },
    });

    return NextResponse.json(org);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao atualizar organização" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!hasPermission(session.user as any, "users:delete")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Soft delete — apenas desativa
    await db.organization.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao desativar organização" }, { status: 500 });
  }
}
