import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/user-schemas";
import { createAuditLog } from "@/lib/audit";
import { hasRole } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao obter usuário" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const isAdmin = hasRole(session.user as any, "ADMIN");
    if (!isAdmin && session.user.id !== id) {
      return NextResponse.json(
        { error: "Sem permissão para editar este usuário" },
        { status: 403 }
      );
    }

    const user = await db.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data = updateUserSchema.parse(body);

    // Non-admins cannot change role
    if (!isAdmin && data.role) {
      return NextResponse.json(
        { error: "Apenas administradores podem alterar roles" },
        { status: 403 }
      );
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { id: true, name: true } },
      },
    });

    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if ((user as any)[key] !== value) {
        changes[key] = { before: (user as any)[key], after: value };
      }
    }

    await createAuditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "User",
      entityId: params.id,
      changes,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao atualizar usuário" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const isAdmin = hasRole(session.user as any, "ADMIN");
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Apenas administradores podem deletar usuários" },
        { status: 403 }
      );
    }

    if (params.id === session.user.id) {
      return NextResponse.json(
        { error: "Você não pode deletar sua própria conta" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    await db.user.delete({
      where: { id: params.id },
    });

    await createAuditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "User",
      entityId: params.id,
      changes: { email: user.email, name: user.name },
    });

    return NextResponse.json({ message: "Usuário deletado com sucesso" });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao deletar usuário" },
      { status: 500 }
    );
  }
}
