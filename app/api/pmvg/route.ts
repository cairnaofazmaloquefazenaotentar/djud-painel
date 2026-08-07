export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getPmvgData } from "@/lib/pmvg-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    return jsonComVersao(request, ["sismatPmvg"], () => getPmvgData());
  } catch (error) {
    console.error("[pmvg] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter a base SISMAT × PMVG";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
