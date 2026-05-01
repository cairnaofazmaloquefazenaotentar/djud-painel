import { Resend } from "resend";
import { generateDemandaHTML, generateRelatórioHTML } from "@/lib/pdf-generator";

// Lazy initialization of Resend client to avoid build-time errors
function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Envia um relatório de demanda por email
 */
export async function sendDemandaReport(
  to: string,
  demandaId: string,
  demandaNumero: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Validar email
    if (!to || !to.includes("@")) {
      return {
        success: false,
        error: "Email inválido",
      };
    }

    // Gerar HTML da demanda
    const html = await generateDemandaHTML(demandaId);

    // Enviar email com Resend
    const resend = getResendClient();
    const response = await resend.emails.send({
      from: "noreply@djud-painel.com",
      to,
      subject: `Relatório de Demanda #${demandaNumero}`,
      html: `
        <html>
          <body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto;">
              <p>Olá,</p>
              <p>Você está recebendo o relatório da demanda <strong>#${demandaNumero}</strong>.</p>
              <p>Clique no botão abaixo para visualizar o documento completo:</p>
              <p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/demandas/${demandaId}/export-pdf"
                   style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Visualizar Demanda
                </a>
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="font-size: 12px; color: #666;">
                Este é um email automático do Sistema DJUD Painel. Não responda a este email.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (!response.data?.id) {
      console.error("Email send response:", response);
      return {
        success: false,
        error: response.error?.message || "Erro ao enviar email",
      };
    }

    return {
      success: true,
      messageId: response.data.id,
    };
  } catch (error) {
    console.error("Error sending demanda report email:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao enviar email",
    };
  }
}

/**
 * Envia um relatório batch de múltiplas demandas por email
 */
export async function sendRelatórioReport(
  to: string,
  filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    prioridade?: string;
    organizacaoId?: string;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Validar email
    if (!to || !to.includes("@")) {
      return {
        success: false,
        error: "Email inválido",
      };
    }

    // Gerar HTML do relatório
    const html = await generateRelatórioHTML(filters);

    // Enviar email com Resend
    const resend = getResendClient();
    const response = await resend.emails.send({
      from: "noreply@djud-painel.com",
      to,
      subject: "Relatório de Demandas Judiciais",
      html: `
        <html>
          <body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto;">
              <p>Olá,</p>
              <p>Você está recebendo um relatório de demandas judiciais conforme solicitado.</p>
              <p>Clique no botão abaixo para visualizar o documento completo:</p>
              <p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/relatorios/export-html"
                   style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Visualizar Relatório
                </a>
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="font-size: 12px; color: #666;">
                Este é um email automático do Sistema DJUD Painel. Não responda a este email.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (!response.data?.id) {
      console.error("Email send response:", response);
      return {
        success: false,
        error: response.error?.message || "Erro ao enviar email",
      };
    }

    return {
      success: true,
      messageId: response.data.id,
    };
  } catch (error) {
    console.error("Error sending relatorio email:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao enviar email",
    };
  }
}
