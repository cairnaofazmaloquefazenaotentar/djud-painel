import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateDemandaSchema } from "@/lib/schemas";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const demanda = await db.demanda.findUnique({
      where: { id: params.id },
      include: {
        organizacao: { select: { id: true, name: true } },
        responsavel: { select: { id: true, name: true, email: true } },
        criadoPor: { select: { id: true, name: true } },
        atualizadoPor: { select: { id: true, name: true } },
      },
    });

    if (!demanda) {
      return NextResponse.json(
        { error: "Demanda não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(demanda);
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao obter demanda" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const canUpdate = hasPermission(session.user as any, "demandas:editar");
    if (!canUpdate) {
      return NextResponse.json(
        { error: "Sem permissão para editar demandas" },
        { status: 403 }
      );
    }

    const demanda = await db.demanda.findUnique({
      where: { id: params.id },
    });

    if (!demanda) {
      return NextResponse.json(
        { error: "Demanda não encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data = updateDemandaSchema.parse(body);

    const updated = await db.demanda.update({
      where: { id: params.id },
      data: {
        ...data,
        atualizadoPorId: session.user.id,
      },
      include: {
        organizacao: { select: { id: true, name: true } },
        responsavel: { select: { id: true, name: true } },
        criadoPor: { select: { id: true, name: true } },
        atualizadoPor: { select: { id: true, name: true } },
      },
    });

    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if ((demanda as any)[key] !== value) {
        changes[key] = { before: (demanda as any)[key], after: value };
      }
    }

    await createAuditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "Demanda",
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
      { error: "Erro ao atualizar demanda" },
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

    const canDelete = hasPermission(session.user as any, "demandas:deletar");
    if (!canDelete) {
      return NextResponse.json(
        { error: "Sem permissão para deletar demandas" },
        { status: 403 }
      );
    }

    const demanda = await db.demanda.findUnique({
      where: { id: params.id },
    });

    if (!demanda) {
      return NextResponse.json(
        { error: "Demanda não encontrada" },
        { status: 404 }
      );
    }

    await db.demanda.delete({
      where: { id: params.id },
    });

    await createAuditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "Demanda",
      entityId: params.id,
      changes: demanda,
    });

    return NextResponse.json({ message: "Demanda deletada com sucesso" });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao deletar demanda" },
      { status: 500 }
    );
  }
}
