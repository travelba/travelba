import { agencyEmailHtml, escapeHtml } from "./email-html";
import {
  extraMomentOf,
  extraPlaceOf,
  extraServiceLeg,
  itineraryOffers,
  type ExtraKind,
} from "./extras";
import { checkinDeskNote } from "./service-desk";
import { formatMoney } from "./money";
import { agencyCopyCc } from "./outbound-mail";
import { productionOnlySecret } from "./preview-secrets";
import { siteConfig } from "@/lib/site";

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const NAVY = "#0B192C";
const MUTED = "#5C6570";
const LINE = "#E7E1D6";

export type ServiceRequestReason = "validated" | "addresses";

export type ServiceRequestMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type MailItem = {
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function clip(value: string, max = 140) {
  const clean = oneLine(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function dossierHref(bookingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return `${siteConfig.url}/admin/reservations`;
  return `${siteConfig.url}/admin/reservations/${bookingId}`;
}

function kindName(kind: string) {
  if (kind === "chauffeur") return "Transfert";
  if (kind === "greeter") return "VIP Airport";
  return "Enregistrement";
}

function serviceLabel(item: MailItem) {
  if (item.kind === "checkin") return "Enregistrement";
  const title = detailText({ title: item.title }, "title") || (item.title || "").trim();
  if (title) return title;
  return kindName(item.kind || "");
}

function headLine(details: Record<string, unknown> | null | undefined) {
  const adults = Number(details?.adults);
  const children = Number(details?.children);
  const parts: string[] = [];
  if (Number.isFinite(adults) && adults > 0) parts.push(`${adults} adulte${adults > 1 ? "s" : ""}`);
  if (Number.isFinite(children) && children > 0) parts.push(`${children} enfant${children > 1 ? "s" : ""}`);
  return parts.join(", ");
}

function factsFor(item: MailItem, siblings: MailItem[], now: Date) {
  const rows: { label: string; value: string }[] = [];
  if (item.kind === "checkin") {
    const passengers = Number(item.details?.passengers);
    if (Number.isFinite(passengers) && passengers > 0) {
      rows.push({ label: "Passagers", value: String(passengers) });
    }
    const flights = siblings.filter((row) => row.kind === "flight");
    const note = checkinDeskNote(flights, now);
    if (note === "ouvert") rows.push({ label: "Fenêtre", value: "Ouverte" });
    else if (note) rows.push({ label: "Fenêtre", value: note });
    return rows;
  }
  const offers = itineraryOffers(siblings);
  const leg = extraServiceLeg(item);
  const place = item.kind === "chauffeur" ? extraPlaceOf(item) : null;
  const moment = item.kind === "greeter" ? extraMomentOf(item) : null;
  const offer = offers.find(
    (row) =>
      row.kind === (item.kind as ExtraKind) &&
      row.leg === leg &&
      (row.place || null) === place &&
      (row.moment || null) === moment
  );
  if (offer?.route) rows.push({ label: "Trajet", value: offer.route });
  if (item.kind === "chauffeur") {
    const pickup = detailText(item.details, "pickup") || offer?.address || "";
    const dropAtHome = place === "home" && leg === "arrival";
    const depart = detailText(item.details, "depart_address") || (dropAtHome ? offer?.airport || "" : pickup);
    const arrive = detailText(item.details, "arrive_address") || (dropAtHome ? pickup : offer?.airport || "");
    if (depart) rows.push({ label: "Départ", value: depart });
    if (arrive) rows.push({ label: "Arrivée", value: arrive });
  } else if (moment) {
    rows.push({ label: "Moment", value: moment === "arrive" ? "Arrivée" : "Départ" });
    const heads = headLine(item.details);
    if (heads) rows.push({ label: "Voyageurs", value: heads });
  }
  if (offer?.flightLine) rows.push({ label: "Vol", value: offer.flightLine });
  return rows;
}

function factsTable(rows: { label: string; value: string }[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">${rows
    .map((row, index) => {
      const rule = index ? `border-top:1px solid ${LINE};` : "";
      return `<tr>
        <td style="padding:11px 16px 11px 0;width:96px;vertical-align:top;font-family:${FONT};font-size:13px;line-height:1.45;color:${MUTED};${rule}">${escapeHtml(row.label)}</td>
        <td style="padding:11px 0;vertical-align:top;font-family:${FONT};font-size:15px;line-height:1.45;font-weight:600;color:${NAVY};${rule}">${escapeHtml(row.value)}</td>
      </tr>`;
    })
    .join("")}</table>`;
}

/** Avis interne : le client a validé un transfert, un VIP ou l’enregistrement. */
export function buildServiceRequestMail(opts: {
  to: string;
  reference: string;
  bookingId: string;
  holderName: string;
  currency?: string | null;
  amount: number;
  reason: ServiceRequestReason;
  item: MailItem;
  items: MailItem[];
  now?: Date;
}): ServiceRequestMail | null {
  const kind = opts.item.kind || "";
  if (kind !== "chauffeur" && kind !== "greeter" && kind !== "checkin") return null;
  if (opts.reason === "addresses" && kind !== "chauffeur") return null;
  const to = opts.to.trim();
  if (!to) return null;
  const holder = oneLine(opts.holderName) || "Client";
  const reference = oneLine(opts.reference) || "Dossier";
  const service = serviceLabel(opts.item);
  const now = opts.now || new Date();
  const rows = factsFor(opts.item, opts.items, now);
  const amount = Number(opts.amount);
  if (Number.isFinite(amount) && amount > 0) {
    rows.push({ label: "Montant", value: formatMoney(amount, opts.currency || "EUR") });
  }
  const href = dossierHref(opts.bookingId);
  const title = opts.reason === "addresses" ? "Nouvelles adresses" : service;
  const intro =
    opts.reason === "addresses"
      ? `${holder} a modifié le départ et l’arrivée du transfert sur le dossier ${reference}.`
      : `${holder} a validé ce service sur le dossier ${reference}.`;
  const subject =
    opts.reason === "addresses"
      ? clip(`${holder} · Nouvelles adresses · ${reference}`)
      : clip(`${holder} · ${service} · ${reference}`);
  const footnote =
    opts.reason === "addresses"
      ? "Ces adresses remplacent les précédentes. Le transfert reste à confirmer dans le dossier."
      : "La demande est dans Services à confirmer, jusqu’à votre confirmation dans le dossier.";
  const bodyHtml = `<p style="margin:0 0 18px;font-size:16px;line-height:1.5;font-family:${FONT};color:${NAVY}">${escapeHtml(intro)}</p>${factsTable(rows)}`;
  const html = agencyEmailHtml({
    title,
    preheader: intro,
    bodyHtml,
    ctaLabel: "Ouvrir le dossier",
    ctaHref: href,
    footnote,
  });
  const text = [subject, intro, ...rows.map((row) => `${row.label} : ${row.value}`), href].join("\n");
  return { to, subject, html, text };
}

export async function deliverServiceRequestMail(
  mail: ServiceRequestMail,
  deps: {
    apiKey?: string | null;
    from?: string;
    send?: (input: { from: string; to: string; cc?: string[]; subject: string; html: string; text: string }) => Promise<{ error: unknown }>;
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
          cc: input.cc,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { error: result.error };
      });
    const { error } = await send({
      from,
      to: mail.to,
      cc: agencyCopyCc(mail.to),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (error) {
      console.error("[crm] avis service non délivré");
      return false;
    }
    return true;
  } catch {
    console.error("[crm] avis service non délivré");
    return false;
  }
}

export async function notifyServiceRequest(
  opts: Omit<Parameters<typeof buildServiceRequestMail>[0], "to"> & {
    to?: string;
    deliver?: typeof deliverServiceRequestMail;
  }
): Promise<boolean> {
  try {
    const to = (opts.to || process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
    const mail = buildServiceRequestMail({ ...opts, to });
    if (!mail) return false;
    const deliver = opts.deliver || deliverServiceRequestMail;
    return await deliver(mail);
  } catch {
    console.error("[crm] avis service non délivré");
    return false;
  }
}
