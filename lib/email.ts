import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteEmail({
  email,
  inviteLink,
  organizationName,
}: {
  email: string;
  inviteLink: string;
  organizationName: string;
}) {
  try {
    await resend.emails.send({
      from: "noreply@djud-painel.com",
      to: email,
      subject: `Convite para ${organizationName} — DJUD Painel`,
      html: `
        <h2>Bem-vindo ao DJUD Painel!</h2>
        <p>Você foi convidado para participar de <strong>${organizationName}</strong>.</p>
        <p>
          <a href="${inviteLink}" style="display: inline-block; padding: 10px 20px; background-color: #1a3a5c; color: white; text-decoration: none; border-radius: 4px;">
            Aceitar convite
          </a>
        </p>
        <p>Este link expira em 7 dias.</p>
        <hr />
        <p style="font-size: 12px; color: #666;">
          DJUD Painel — Painel de Saúde Demandas Judiciais<br />
          Ministério da Saúde
        </p>
      `,
    });

    return true;
  } catch (error) {
    console.error("[Email Error]", error);
    return false;
  }
}

export async function sendNotificationEmail({
  email,
  subject,
  html,
}: {
  email: string;
  subject: string;
  html: string;
}) {
  try {
    await resend.emails.send({
      from: "noreply@djud-painel.com",
      to: email,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error("[Email Error]", error);
    return false;
  }
}
