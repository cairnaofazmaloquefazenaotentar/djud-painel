export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getPmvgData } from "@/lib/pmvg-metrics";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const data = await getPmvgData();

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" }, // 1h: base de referência muda pouco
    });
  } catch (error) {
    console.error("[pmvg] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter a base SISMAT × PMVG";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
