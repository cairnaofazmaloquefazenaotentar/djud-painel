export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  password: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres"),
});

/**
 * POST /api/users/[id]/change-password
 * Altera a senha do usuário após validar a senha atual.
 * Qualquer usuário pode alterar a própria senha; admins podem alterar de qualquer user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const isAdmin = (session.user as any).role === "ADMIN";
    const isSelf = session.user.id === id;

    if (!isAdmin && !isSelf) {
      return NextResponse.json(
        { error: "Sem permissão para alterar a senha deste usuário" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const { currentPassword, password } = parsed.data;

    // Buscar usuário com senha atual
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, password: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { error: "Este usuário não possui senha cadastrada (usa login social)" },
        { status: 400 }
      );
    }

    // Validar senha atual (admin que altera senha alheia não precisa validar)
    if (!isAdmin || isSelf) {
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { error: "Senha atual incorreta" },
          { status: 400 }
        );
      }
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    await createAuditLog({
      userId: session.user.id as string,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      changes: { password: { before: "[redacted]", after: "[redacted]" } },
    });

    return NextResponse.json({ message: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: "Erro ao alterar senha" },
      { status: 500 }
    );
  }
}
