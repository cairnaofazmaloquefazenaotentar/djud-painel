import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const organizations = await db.organization.findMany({
      where: { active: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      data: organizations,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao listar organizações" },
      { status: 500 }
    );
  }
}
