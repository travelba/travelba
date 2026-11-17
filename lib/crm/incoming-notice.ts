import { formatMoney } from "@/lib/crm/money";

/** Un virement client entrant. Une sortie, un intérêt ou un versement Stripe ne s’annoncent pas. */
export function shouldAlertRevolutTransfer(input: { direction?: string | null; category?: string | null }) {
  if ((input.direction || "") === "debit") return false;
  if (input.direction && input.direction !== "credit") return false;
  const category = input.category || "client";
  return category === "client";
}

export function revolutNoticeKey(id: string) {
  return `revolut:${id.trim()}`;
}

export function stripeNoticeKey(id: string) {
  return `stripe:${id.trim()}`;
}

/**
 * Vrai une seule fois pour une clé. Une sortie ne réserve rien.
 * Webhook et cron partagent la même clé (id Revolut ou PaymentIntent).
 */
export function admitIncomingNotice(
  seen: Set<string>,
  input: { id: string; direction?: string | null; category?: string | null; key?: string }
) {
  if (input.direction != null || input.category != null) {
    if (!shouldAlertRevolutTransfer(input)) return false;
  }
  const key = (input.key || revolutNoticeKey(input.id)).trim();
  if (!input.id.trim() || key.endsWith(":")) return false;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** IBAN et numéro de carte : quatre derniers caractères, jamais le reste. */
export function redactPaymentSecrets(text: string) {
  const iban = text.replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi, (value) => {
    const compact = value.replace(/\s+/g, "");
    return `····${compact.slice(-4)}`;
  });
  return iban.replace(/\b(?:\d[ -]?){13,19}\b/g, (value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return value;
    return `····${digits.slice(-4)}`;
  });
}

/** « Virement reçu · montant · payeur », plus le client ou le dossier s’il est reconnu. */
export function wireReceivedSummary(input: {
  amount: number;
  currency: string;
  payer: string;
  client?: string | null;
  reference?: string | null;
}) {
  const money = formatMoney(input.amount, input.currency || "EUR");
  const payer = (input.payer || "").trim() || "Payeur";
  const parts = ["Virement reçu", money, payer];
  const client = (input.client || "").trim();
  if (client) parts.push(client);
  const reference = ((input.reference || "").match(/TB-\d{4}-\d+/i) || [])[0];
  if (reference) parts.push(reference.toUpperCase());
  return redactPaymentSecrets(parts.filter(Boolean).join(" · ")).slice(0, 240);
}

export const ARGENT_QUEUE_HREF = "/admin/argent?onglet=a-encaisser";
