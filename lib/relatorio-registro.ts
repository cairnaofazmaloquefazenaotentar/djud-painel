import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Registro de relatório emitido (tabela RelatorioGerado). Todo relatório e toda
// exportação grava aqui e no AuditLog; a falha deste registro não pode impedir
// a entrega do documento — o AuditLog continua sendo a trilha principal.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoRelatorio = "PESQUISA_PRECO" | "ARP" | "RISCO" | "EXECUTIVO" | "DEMANDAS";

export async function registrarRelatorio(dados: {
  tipo: TipoRelatorio;
  parametros: Prisma.InputJsonValue;
  nomeArquivo: string;
  tamanhoBytes: number | null;
  geradoPorId: string;
}): Promise<void> {
  try {
    await db.relatorioGerado.create({
      data: {
        tipo: dados.tipo,
        parametros: dados.parametros,
        nomeArquivo: dados.nomeArquivo,
        tamanhoBytes: dados.tamanhoBytes,
        geradoPorId: dados.geradoPorId,
      },
    });
  } catch (error) {
    console.error("[relatorio-registro] falha ao gravar RelatorioGerado:", error);
  }
}
