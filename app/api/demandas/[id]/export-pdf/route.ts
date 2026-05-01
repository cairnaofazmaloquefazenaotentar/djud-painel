import { auth } from "@/lib/auth";
import { generateDemandaHTML } from "@/lib/pdf-generator";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/demandas/[id]/export-pdf
 * Retorna HTML formatado para impressão em PDF
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Gerar HTML
    const html = await generateDemandaHTML(id);

    // Retornar como HTML para impressão
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="demanda-${id}.html"`,
      },
    });
  } catch (error) {
    console.error("Error exporting demanda PDF:", error);
    const message =
      error instanceof Error ? error.message : "Error exporting demanda";

    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Demanda not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
