import nodemailer from "nodemailer";

export class TenantInvitationEmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantInvitationEmailConfigurationError";
  }
}

type TenantInvitationEmailInput = {
  email: string;
  ownerName?: string | null;
  token: string;
};

export async function sendTenantInvitationEmail(input: TenantInvitationEmailInput) {
  const configuration = getEmailConfiguration();
  const invitationUrl = buildInvitationUrl(configuration.appUrl, input.token);
  const ownerName = input.ownerName?.trim() || "Nexbail";
  const subject = "Invitation à votre portail locataire Nexbail";
  const text = [
    "Nexbail",
    "",
    `${ownerName} vous invite à accéder à votre portail locataire.`,
    "",
    "Vous pourrez consulter votre bail, vos paiements, vos documents partagés et transmettre des demandes d'entretien.",
    "",
    `Accéder à mon portail : ${invitationUrl}`,
    "",
    "Cette invitation expire après 14 jours.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:24px;margin:0 0 24px">Nexbail</h1>
      <p>${escapeHtml(ownerName)} vous invite à accéder à votre portail locataire.</p>
      <p>Vous pourrez consulter votre bail, vos paiements, vos documents partagés et transmettre des demandes d'entretien.</p>
      <p style="margin:28px 0">
        <a href="${escapeHtml(invitationUrl)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700">Accéder à mon portail</a>
      </p>
      <p style="font-size:14px;color:#64748b">Cette invitation expire après 14 jours.</p>
    </div>
  `.trim();

  const transport = nodemailer.createTransport({
    auth: {
      pass: configuration.password,
      user: configuration.user,
    },
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
  });

  await transport.sendMail({
    from: configuration.from,
    html,
    subject,
    text,
    to: input.email,
  });
}

function getEmailConfiguration() {
  const required = {
    appUrl: process.env.HABIXA_APP_URL,
    from: process.env.HABIXA_EMAIL_FROM,
    host: process.env.HABIXA_SMTP_HOST,
    password: process.env.HABIXA_SMTP_PASSWORD,
    port: process.env.HABIXA_SMTP_PORT,
    user: process.env.HABIXA_SMTP_USER,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new TenantInvitationEmailConfigurationError(`Configuration courriel incomplète: ${missing.join(", ")}.`);
  }

  const port = Number(required.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TenantInvitationEmailConfigurationError("HABIXA_SMTP_PORT est invalide.");
  }

  const appUrl = normalizeAppUrl(required.appUrl!);

  return {
    appUrl,
    from: required.from!,
    host: required.host!,
    password: required.password!,
    port,
    secure: process.env.HABIXA_SMTP_SECURE === "true" || port === 465,
    user: required.user!,
  };
}

function normalizeAppUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TenantInvitationEmailConfigurationError("HABIXA_APP_URL est invalide.");
  }

  const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new TenantInvitationEmailConfigurationError("HABIXA_APP_URL doit utiliser HTTPS.");
  }

  return url.origin;
}

function buildInvitationUrl(appUrl: string, token: string) {
  const url = new URL("/locataire/invitation", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}
