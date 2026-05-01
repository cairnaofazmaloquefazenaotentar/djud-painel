import { db } from "@/lib/db";
import { formatFileSize } from "@/lib/file-utils";

/**
 * Gera um relatório em HTML para uma demanda individual
 * Pode ser convertido para PDF usando print-to-PDF do navegador
 */
export async function generateDemandaHTML(demandaId: string): Promise<string> {
  try {
    // Buscar dados da demanda
    const demanda = await db.demanda.findUnique({
      where: { id: demandaId },
      include: {
        responsavel: { select: { name: true } },
        organizacao: { select: { name: true } },
        criadoPor: { select: { name: true } },
        atualizadoPor: { select: { name: true } },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            uploadedAt: true,
            uploadedBy: { select: { name: true } },
          },
        },
      },
    });

    if (!demanda) {
      throw new Error("Demanda not found");
    }

    return generateDemandaPDFHTML(demanda);
  } catch (error) {
    console.error("Error generating demanda HTML:", error);
    throw error;
  }
}

/**
 * Gera um relatório em HTML com múltiplas demandas
 */
export async function generateRelatórioHTML(filters?: {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  prioridade?: string;
  organizacaoId?: string;
}): Promise<string> {
  try {
    // Buscar demandas com filtros
    const where: any = {};

    if (filters?.startDate) {
      where.criadoEm = { gte: filters.startDate };
    }
    if (filters?.endDate) {
      where.criadoEm = where.criadoEm
        ? { ...where.criadoEm, lte: filters.endDate }
        : { lte: filters.endDate };
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.prioridade) {
      where.prioridade = filters.prioridade;
    }
    if (filters?.organizacaoId) {
      where.organizacaoId = filters.organizacaoId;
    }

    const demandas = await db.demanda.findMany({
      where,
      include: {
        responsavel: { select: { name: true } },
        organizacao: { select: { name: true } },
        criadoPor: { select: { name: true } },
      },
      orderBy: { criadoEm: "desc" },
      take: 100,
    });

    // Calcular estatísticas
    const stats = {
      total: demandas.length,
      byStatus: {} as Record<string, number>,
      byPrioridade: {} as Record<string, number>,
    };

    demandas.forEach((d) => {
      if (d.status) {
        stats.byStatus[d.status] = (stats.byStatus[d.status] || 0) + 1;
      }
      if (d.prioridade) {
        stats.byPrioridade[d.prioridade] = (stats.byPrioridade[d.prioridade] || 0) + 1;
      }
    });

    return generateRelatorioPDFHTML({
      demandas,
      stats,
      filters,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error("Error generating relatorio HTML:", error);
    throw error;
  }
}

/**
 * Gera HTML de demanda formatado como PDF
 */
function generateDemandaPDFHTML(demanda: any): string {
  const statusColor = {
    Aberta: "#10b981",
    Fechada: "#ef4444",
    Arquivada: "#f59e0b",
    Pendente: "#3b82f6",
  };

  const prioridadeColor = {
    Baixa: "#10b981",
    Média: "#f59e0b",
    Alta: "#ef4444",
    Crítica: "#7c3aed",
  };

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const attachmentsHTML =
    demanda.attachments && demanda.attachments.length > 0
      ? `
    <div style="margin-top: 30px; page-break-inside: avoid;">
      <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #ddd; padding-bottom: 10px;">Anexos</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px;">
        ${demanda.attachments
          .map(
            (att: any) => `
          <div style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
            <div style="font-weight: bold; margin-bottom: 5px;">${att.fileName}</div>
            <div style="font-size: 12px; color: #666;">
              <div>Tamanho: ${formatFileSize(att.fileSize)}</div>
              <div>Upload: ${formatDate(att.uploadedAt)}</div>
              <div>Por: ${att.uploadedBy?.name || "Desconhecido"}</div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `
      : "";

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Demanda ${demanda.numero}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background: #f5f5f5;
          padding: 20px;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 3px solid #0066cc;
          padding-bottom: 20px;
        }
        .header h1 {
          font-size: 28px;
          color: #0066cc;
          margin-bottom: 5px;
        }
        .header p {
          color: #666;
          font-size: 14px;
        }
        .section {
          margin-bottom: 30px;
          page-break-inside: avoid;
        }
        .section h2 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 15px;
          border-bottom: 2px solid #ddd;
          padding-bottom: 10px;
        }
        .field {
          margin-bottom: 15px;
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 20px;
        }
        .label {
          font-weight: bold;
          color: #0066cc;
          font-size: 14px;
        }
        .value {
          color: #333;
          word-break: break-word;
        }
        .badge {
          display: inline-block;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          color: white;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
        }
        @media print {
          body { background: white; padding: 0; }
          .container { box-shadow: none; }
          .section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Demanda Judicial #${demanda.numero}</h1>
          <p>Relatório gerado em ${formatDate(new Date())}</p>
        </div>

        <div class="section">
          <h2>Informações Gerais</h2>
          <div class="field">
            <div class="label">Número</div>
            <div class="value">${demanda.numero}</div>
          </div>
          <div class="field">
            <div class="label">Título</div>
            <div class="value">${demanda.titulo}</div>
          </div>
          <div class="field">
            <div class="label">Descrição</div>
            <div class="value">${demanda.descricao}</div>
          </div>
          <div class="field">
            <div class="label">Status</div>
            <div class="value">
              <span class="badge" style="background-color: ${statusColor[demanda.status as keyof typeof statusColor] || "#999"}">
                ${demanda.status || "N/A"}
              </span>
            </div>
          </div>
          <div class="field">
            <div class="label">Prioridade</div>
            <div class="value">
              <span class="badge" style="background-color: ${prioridadeColor[demanda.prioridade as keyof typeof prioridadeColor] || "#999"}">
                ${demanda.prioridade || "N/A"}
              </span>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Detalhes</h2>
          <div class="grid-2">
            <div>
              <div class="field">
                <div class="label">Organização</div>
                <div class="value">${demanda.organizacao?.name || "N/A"}</div>
              </div>
              <div class="field">
                <div class="label">Responsável</div>
                <div class="value">${demanda.responsavel?.name || "N/A"}</div>
              </div>
              <div class="field">
                <div class="label">Data Início</div>
                <div class="value">${demanda.dataInicio ? formatDate(demanda.dataInicio) : "N/A"}</div>
              </div>
            </div>
            <div>
              <div class="field">
                <div class="label">Data Vencimento</div>
                <div class="value">${demanda.dataVencimento ? formatDate(demanda.dataVencimento) : "N/A"}</div>
              </div>
              <div class="field">
                <div class="label">Valor Estimado</div>
                <div class="value">${demanda.valorEstimado ? `R$ ${Number(demanda.valorEstimado).toLocaleString("pt-BR")}` : "N/A"}</div>
              </div>
              <div class="field">
                <div class="label">Projeto</div>
                <div class="value">${demanda.projeto || "N/A"}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Auditoria</h2>
          <div class="field">
            <div class="label">Criado por</div>
            <div class="value">${demanda.criadoPor?.name || "Desconhecido"} em ${formatDate(demanda.criadoEm)}</div>
          </div>
          <div class="field">
            <div class="label">Atualizado por</div>
            <div class="value">${demanda.atualizadoPor?.name || "Nunca"} ${demanda.atualizadoPor ? `em ${formatDate(demanda.atualizadoEm)}` : ""}</div>
          </div>
        </div>

        ${attachmentsHTML}
      </div>
    </body>
    </html>
  `;
}

/**
 * Gera HTML de relatório formatado como PDF
 */
function generateRelatorioPDFHTML(params: any): string {
  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const demandasHTML = params.demandas
    .map(
      (d: any) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.numero}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.titulo.substring(0, 40)}...</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.status || "N/A"}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.prioridade || "N/A"}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.responsavel?.name || "N/A"}</td>
    </tr>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório de Demandas</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
          padding: 20px;
        }
        .container { max-width: 1000px; margin: 0 auto; }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #0066cc;
          padding-bottom: 20px;
        }
        h1 { font-size: 24px; color: #0066cc; margin-bottom: 5px; }
        .summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }
        .stat {
          background: #f0f4ff;
          padding: 15px;
          border-radius: 5px;
          text-align: center;
        }
        .stat-value {
          font-size: 24px;
          font-weight: bold;
          color: #0066cc;
        }
        .stat-label {
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th {
          background: #0066cc;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: bold;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Relatório de Demandas Judiciais</h1>
          <p>Gerado em ${formatDate(params.generatedAt)}</p>
        </div>

        <div class="summary">
          <div class="stat">
            <div class="stat-value">${params.stats.total}</div>
            <div class="stat-label">Total de Demandas</div>
          </div>
          ${Object.entries(params.stats.byStatus)
            .map(
              ([status, count]) => `
            <div class="stat">
              <div class="stat-value">${count}</div>
              <div class="stat-label">${status}</div>
            </div>
          `
            )
            .join("")}
        </div>

        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Título</th>
              <th>Status</th>
              <th>Prioridade</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            ${demandasHTML}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}
