import { validBic, validIban } from "./invoice-document";

export type InvoiceSettingsInput = {
  iban: string | null;
  bic: string | null;
  holder: string | null;
  dueDays: number | null;
};

/** Saisie du réglage Facture. Un champ vide efface. Rien n’est inventé. */
export function parseInvoiceSettings(body: unknown): InvoiceSettingsInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Réglage illisible." };
  const raw = body as Record<string, unknown>;
  const ibanRaw = typeof raw.iban === "string" ? raw.iban.trim() : "";
  const bicRaw = typeof raw.bic === "string" ? raw.bic.trim() : "";
  const holder = typeof raw.holder === "string" ? raw.holder.trim().slice(0, 140) : "";
  const dueRaw = raw.due_days;
  let dueDays: number | null = null;
  if (dueRaw != null && String(dueRaw).trim() !== "") {
    const days = Number(dueRaw);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      return { error: "Le délai d’échéance est un nombre de jours, entre 0 et 365." };
    }
    dueDays = days;
  }
  if (bicRaw && !validBic(bicRaw)) return { error: "Ce BIC n’est pas lisible." };
  if (!ibanRaw) {
    return { iban: null, bic: validBic(bicRaw), holder: holder || null, dueDays };
  }
  const iban = validIban(ibanRaw);
  if (!iban) return { error: "Cet IBAN n’est pas lisible." };
  return { iban, bic: validBic(bicRaw), holder: holder || null, dueDays };
}
