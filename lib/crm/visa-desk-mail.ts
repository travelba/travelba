import { agencyEmailHtml, escapeHtml } from "./email-html";
import { clipPortalText, PORTAL_KIND_LABEL, type PortalLogKind } from "./eta-il-log";
import { redactPassportNumbers } from "./eta-il-session";
import { productionOnlySecret } from "./preview-secrets";
import { siteConfig } from "@/lib/site";

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const NAVY = "#0B192C";

/** Situations à signaler. Les clics et champs restent dans le journal du dossier. */
const MAILED: ReadonlySet<PortalLogKind> = new Set(["ouvert", "echec", "attente", "erreur", "fini"]);

const CODA: Partial<Record<PortalLogKind, string>> = {
  ouvert: "Le portail officiel est ouvert.",
  echec: "Le portail ne s’est pas ouvert. Le dossier revient en préparation.",
  attente: "Rien n’est envoyé au site officiel à cette étape.",
  erreur: "Le dossier revient en préparation. Le formulaire n’a pas été envoyé.",
  fini: "Le numéro de carte reste chez Pliant. Le règlement officiel se fait sur le portail, pas dans Travelba.",
};

export type DeskMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function redactDeskText(text: string, passports: string[] = []) {
  const withoutPassport = redactPassportNumbers(text, passports).replace(/\b\d{2}[A-Z]{2}\d{5}\b/g, "•••");
  return withoutPassport.replace(/(?:\d[ -]?){13,19}/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return match;
    return "•••";
  });
}

export function visaDeskMailsKind(kind: PortalLogKind) {
  return MAILED.has(kind);
}

function dossierHref(bookingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return `${siteConfig.url}/admin/reservations`;
  return `${siteConfig.url}/admin/reservations/${bookingId}`;
}

export function buildVisaDeskMail(opts: {
  reference: string;
  bookingId: string;
  kind: PortalLogKind;
  text: string;
  to: string;
}): DeskMail | null {
  if (!visaDeskMailsKind(opts.kind)) return null;
  const line = clipPortalText(redactDeskText(opts.text));
  if (!line) return null;
  const label = PORTAL_KIND_LABEL[opts.kind];
  const reference = opts.reference.trim() || "Dossier";
  const coda = CODA[opts.kind] || "";
  const subject = redactDeskText(`ETA-IL · ${reference} · ${label}`);
  const href = dossierHref(opts.bookingId);
  const paragraphs = [line, coda].filter(Boolean).map(
    (part) =>
      `<p style="margin:0 0 12px;line-height:1.5;font-family:${FONT};color:${NAVY}">${escapeHtml(part)}</p>`
  );
  const html = agencyEmailHtml({
    title: `${reference} · ${label}`,
    preheader: line,
    bodyHtml: paragraphs.join(""),
    ctaLabel: "Ouvrir le dossier",
    ctaHref: href,
    footnote: "Journal du portail ETA-IL. Aucun numéro de passeport ni de carte.",
  });
  const text = redactDeskText([subject, line, coda, href].filter(Boolean).join("\n"));
  return { to: opts.to.trim(), subject, html, text };
}

export async function deliverVisaDeskMail(
  mail: DeskMail,
  deps: {
    apiKey?: string | null;
    from?: string;
    send?: (input: { from: string; to: string; subject: string; html: string; text: string }) => Promise<{ error: unknown }>;
  } = {}
): Promise<boolean> {
  const apiKey = deps.apiKey === undefined ? productionOnlySecret(process.env.RESEND_API_KEY) : deps.apiKey;
  if (!apiKey || !mail.to || !mail.text) return false;
  const fromAddress = deps.from || process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const from = `${siteConfig.name} <${fromAddress}>`;
  try {
    const send =
      deps.send ||
      (async (input) => {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
          from: input.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { error: result.error };
      });
    const { error } = await send({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    if (error) {
      console.error("[eta-il] avis agence non délivré");
      return false;
    }
    return true;
  } catch {
    console.error("[eta-il] avis agence non délivré");
    return false;
  }
}

export async function notifyVisaDeskEvent(opts: {
  reference: string;
  bookingId: string;
  kind: PortalLogKind;
  text: string;
  to?: string;
  deliver?: typeof deliverVisaDeskMail;
}): Promise<boolean> {
  try {
    const to = (opts.to || process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
    const mail = buildVisaDeskMail({ ...opts, to });
    if (!mail) return false;
    const deliver = opts.deliver || deliverVisaDeskMail;
    return await deliver(mail);
  } catch {
    console.error("[eta-il] avis agence non délivré");
    return false;
  }
}
