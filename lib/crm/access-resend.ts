import { createHash, randomBytes } from "node:crypto";
import { siteConfig } from "../site";
import { accessLoginEmailVariable } from "./login-email";
import { greetingForWhatsapp, CONCIERGE_SIGNATURE, type WhatsappSendResult } from "./whatsapp";

export { accessLoginEmailVariable, loginEmailFromSearch } from "./login-email";

/** Modèle Utility soumis par `scripts/arm-whatsapp-concierge.ts`. Le SID n’est pas ici. */
export const ACCESS_TEMPLATE_KEY = "acces_client";
export const ACCESS_TEMPLATE_ENV = "TWILIO_CONTENT_ACCES_CLIENT";
export const ACCESS_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_BYTES = 32;

/** 32 octets en base64url : 43 caractères, sans padding. */
export const EXAMPLE_ACCESS_TOKEN = "exempleAcces30joursExempleAcces30joursExXXX";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const TEMPLATE_BODY = [
  "Bonjour {{1}},",
  "",
  "Voici vos accès à l’espace client.",
  "Le premier bouton ouvre la page de connexion, avec votre e-mail déjà indiqué.",
  "Le second est personnel, à usage unique, et reste valable 30 jours. Il ouvre votre espace, ou la page pour choisir votre mot de passe.",
  "Aucun mot de passe n’est dans ce message.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

export function isAccessToken(value: string) {
  return TOKEN_RE.test(value);
}

/** Jeton aléatoire. Il ne doit ni être écrit en base, ni partir dans un journal. */
export function createAccessToken() {
  return randomBytes(ACCESS_TOKEN_BYTES).toString("base64url");
}

/** Empreinte SHA-256 hex. Seule valeur conservée. */
export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function accessExpiresAt(now: Date) {
  return new Date(now.getTime() + ACCESS_LINK_TTL_MS);
}

export function accessOtpType(mustSetPassword: boolean): "magiclink" | "recovery" {
  return mustSetPassword ? "recovery" : "magiclink";
}

export type AccessGate = "preview" | "busy" | "same" | "open" | "refuse";

/**
 * Aperçu WhatsApp : on ne consomme pas le jeton.
 * Une autre session déjà ouverte ici non plus.
 * Sinon une seule ouverture, dans les 30 jours, tant qu’il n’est ni révoqué ni déjà utilisé.
 */
export function accessLinkGate(input: {
  tokenOk: boolean;
  alive: boolean;
  openRequested: boolean;
  previewBot: boolean;
  sessionEmail: string | null | undefined;
  accountEmail: string | null | undefined;
}): AccessGate {
  if (!input.openRequested || input.previewBot) return input.tokenOk && input.alive ? "preview" : "refuse";
  if (!input.tokenOk || !input.alive) return "refuse";
  const session = (input.sessionEmail || "").trim().toLowerCase();
  const account = (input.accountEmail || "").trim().toLowerCase();
  if (session && account && session !== account) return "busy";
  if (session && account && session === account) return "same";
  return "open";
}

export function accessRowAlive(row: { expires_at: string; revoked_at: string | null; used_at: string | null } | null, now: Date) {
  if (!row) return false;
  if (row.revoked_at || row.used_at) return false;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > now.getTime();
}

function cleanName(firstName: string | null | undefined) {
  return (greetingForWhatsapp(firstName) || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
}

/** {{1}} prénom, {{2}} e-mail encodé, {{3}} jeton. Pas d’URL dans le corps. */
export function accessContentVariables(firstName: string | null | undefined, email: string, token: string) {
  if (!isAccessToken(token)) return null;
  const mail = accessLoginEmailVariable(email);
  if (!mail) return null;
  const name = cleanName(firstName);
  if (/https?:|travelba\.fr|\/acces|\/connexion|mot de passe/i.test(name)) return null;
  return { "1": name || " ", "2": mail, "3": token };
}

/** Texte du journal. Le jeton et les adresses n’y entrent pas. */
export function accessTemplatePreview(firstName: string | null | undefined) {
  const text = TEMPLATE_BODY.replace("{{1}}", cleanName(firstName) || "");
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text.replace("Bonjour ,", "Bonjour,");
}

export function accessContentDrafts() {
  const sampleMail = accessLoginEmailVariable("camille.exemple@travelba.fr");
  return [
    {
      template: ACCESS_TEMPLATE_KEY,
      env: ACCESS_TEMPLATE_ENV,
      friendlyName: ACCESS_TEMPLATE_KEY,
      create: {
        friendly_name: ACCESS_TEMPLATE_KEY,
        language: "fr" as const,
        variables: {
          "1": "Camille",
          "2": sampleMail || "camille.exemple%40travelba.fr",
          "3": EXAMPLE_ACCESS_TOKEN,
        },
        types: {
          "twilio/call-to-action": {
            body: TEMPLATE_BODY,
            actions: [
              {
                type: "URL" as const,
                title: "Se connecter",
                url: `${siteConfig.url}/connexion?email={{2}}`,
              },
              {
                type: "URL" as const,
                title: "Ouvrir mon espace",
                url: `${siteConfig.url}/acces/{{3}}`,
              },
            ],
          },
        },
      },
    },
  ];
}

/** Retire le jeton, l’adresse et le téléphone d’un accusé Twilio avant de l’écrire. */
export function accessSafeDetail(detail: string | undefined, secret?: string | null) {
  let text = detail || "";
  if (secret) text = text.split(secret).join("");
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\/acces\/[A-Za-z0-9_-]+/g, "")
    .replace(/[A-Za-z0-9_-]{43}/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function accessPreviewMarkup() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Le Concierge</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#faf9f6;color:#0b192c">
<main style="max-width:420px;margin:12vh auto;padding:0 20px">
<h1 style="font-size:22px;margin:0 0 12px">Votre espace</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">Ce lien est personnel, à usage unique, et reste valable 30 jours. Il ouvre votre espace, ou la page pour choisir votre mot de passe.</p>
<p style="margin:0"><a id="ouvrir" href="" style="display:inline-block;background:#0b192c;color:#faf9f6;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700">Ouvrir mon espace</a></p>
</main>
<script>
document.getElementById("ouvrir").addEventListener("click", function (event) {
  event.preventDefault();
  var url = new URL(location.href);
  url.searchParams.set("ouvrir", "1");
  location.assign(url.toString());
});
</script>
</body>
</html>`;
}

export function accessDeadMarkup() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Le Concierge</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#faf9f6;color:#0b192c">
<main style="max-width:420px;margin:12vh auto;padding:0 20px">
<h1 style="font-size:22px;margin:0 0 12px">Ce lien ne s’ouvre plus</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">Il a expiré, il a déjà été utilisé, ou un accès plus récent l’a remplacé.</p>
<p style="margin:0"><a href="/connexion" style="color:#0b192c;font-weight:700">Se connecter</a></p>
</main>
</body>
</html>`;
}

export function accessBusyMarkup() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Le Concierge</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#faf9f6;color:#0b192c">
<main style="max-width:420px;margin:12vh auto;padding:0 20px">
<h1 style="font-size:22px;margin:0 0 12px">Une session est déjà ouverte ici</h1>
<p style="font-size:15px;line-height:1.5;margin:0">Ce navigateur est connecté à un autre compte. Ouvrez le lien dans une fenêtre privée ou sur le téléphone du client. Le lien reste valable.</p>
</main>
</body>
</html>`;
}

export type AccessJournalRow = {
  customer_id: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  phone: string | null;
  author_staff_id: string | null;
  twilio_sid: string | null;
  payload: { actor: string } | null;
};

export type AccessDeliverResult =
  | { ok: true; sid: string; statut: "sent"; message: string }
  | { ok: false; code: "variables" | "insert" | "journal" | "rejected"; statut: "failed"; message: string };

export async function deliverAccessResend(
  input: {
    customerId: string;
    email: string;
    firstName: string | null | undefined;
    phone: string | null;
    token: string;
    staffId: string | null;
    actor: string;
  },
  deps: {
    revokeActive: (customerId: string) => Promise<boolean>;
    insertToken: (row: { customerId: string; tokenHash: string; expiresAt: string; staffId: string | null }) => Promise<boolean>;
    revokeHash: (tokenHash: string) => Promise<void>;
    send: (variables: Record<string, string>) => Promise<WhatsappSendResult>;
    remember: (row: AccessJournalRow) => Promise<boolean>;
    audit: (summary: string) => Promise<void>;
    now?: Date;
  }
): Promise<AccessDeliverResult> {
  const now = deps.now ?? new Date();
  const variables = accessContentVariables(input.firstName, input.email, input.token);
  const body = accessTemplatePreview(input.firstName);
  const actor = input.actor.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "l’agence";
  if (!variables || !body) {
    await deps.audit(`Échec du renvoi des accès par WhatsApp (${actor}).`);
    return { ok: false, code: "variables", statut: "failed", message: "Ces accès ne peuvent pas partir par WhatsApp." };
  }
  const tokenHash = hashAccessToken(input.token);
  if (!(await deps.revokeActive(input.customerId))) {
    await deps.audit(`Échec du renvoi des accès par WhatsApp (${actor}).`);
    return { ok: false, code: "insert", statut: "failed", message: "Les accès n’ont pas pu être préparés. Rien n’a été envoyé." };
  }
  const inserted = await deps.insertToken({
    customerId: input.customerId,
    tokenHash,
    expiresAt: accessExpiresAt(now).toISOString(),
    staffId: input.staffId,
  });
  if (!inserted) {
    await deps.audit(`Échec du renvoi des accès par WhatsApp (${actor}).`);
    return { ok: false, code: "insert", statut: "failed", message: "Les accès n’ont pas pu être préparés. Rien n’a été envoyé." };
  }
  const base = {
    customer_id: input.customerId,
    body,
    phone: input.phone,
    author_staff_id: input.staffId,
    payload: input.staffId ? null : { actor },
  };
  const queued = await deps.remember({ ...base, status: "queued", error: null, twilio_sid: null });
  if (!queued) {
    await deps.revokeHash(tokenHash);
    await deps.audit(`Échec du renvoi des accès par WhatsApp (${actor}).`);
    return { ok: false, code: "journal", statut: "failed", message: "L’envoi n’a pas pu être enregistré. Rien n’a été envoyé." };
  }
  const sent = await deps.send(variables);
  if (!sent.ok) {
    await deps.revokeHash(tokenHash);
    const error = accessSafeDetail(sent.detail, input.token) || sent.reason;
    await deps.remember({ ...base, status: "failed", error, twilio_sid: null });
    await deps.audit(`Échec du renvoi des accès par WhatsApp (${actor}).`);
    return { ok: false, code: "rejected", statut: "failed", message: "WhatsApp n’a pas pu remettre les accès. Réessayez." };
  }
  await deps.remember({ ...base, status: "sent", error: null, twilio_sid: sent.sid });
  await deps.audit(`Accès renvoyés par WhatsApp (${actor}).`);
  return { ok: true, sid: sent.sid, statut: "sent", message: "Accès renvoyés par WhatsApp." };
}
