import { siteConfig } from "@/lib/site";
import { validBic, validIban } from "./invoice-document";
import { groupIban } from "./revolut-wire";
import type { StatementModel, StatementSection, StatementTransfer } from "./statement";

/**
 * RIB du relevé. Même source que la facture et la page de paiement :
 * compte euros Revolut Main, puis le réglage Facture, puis les variables
 * TBA_RIB_* si les deux sont vides. Aucun IBAN n’est écrit ici.
 */

export type StatementRibParts = {
  holder?: string | null;
  iban?: string | null;
  bic?: string | null;
  bank?: string | null;
};

export type StatementWire = {
  holder: string;
  iban: string;
  bic: string;
  bank: string;
  source: "revolut" | "reglage" | "env";
};

const DOSSIER_REF = /\bTB-\d{4}-\d+\b/gi;

function usable(parts: StatementRibParts | null | undefined) {
  const iban = validIban(parts?.iban);
  if (!iban) return null;
  const holder = (parts?.holder || "").trim() || siteConfig.legal.legalName;
  return { holder, iban, bic: validBic(parts?.bic) || "" };
}

/**
 * Revolut, puis le réglage Facture, puis l’environnement.
 * La banque vient de TBA_RIB_BANK. Sans cette variable, seul le compte Revolut
 * porte le libellé « Revolut ». Un IBAN illisible ne donne rien.
 */
export function statementWireFromParts(
  revolut: StatementRibParts | null | undefined,
  settings: StatementRibParts | null | undefined,
  env: StatementRibParts | null | undefined
): StatementWire | null {
  const bankOverride = (env?.bank || "").replace(/[\r\n]+/g, " ").trim();
  const fromRevolut = usable(revolut);
  if (fromRevolut) {
    return { ...fromRevolut, bank: bankOverride || "Revolut", source: "revolut" };
  }
  const fromSettings = usable(settings);
  if (fromSettings) {
    return { ...fromSettings, bank: bankOverride, source: "reglage" };
  }
  const fromEnv = usable(env);
  if (fromEnv) {
    return { ...fromEnv, bank: bankOverride, source: "env" };
  }
  return null;
}

export function statementEnvRib(env: NodeJS.ProcessEnv = process.env): StatementRibParts {
  return {
    holder: env.TBA_RIB_HOLDER,
    iban: env.TBA_RIB_IBAN,
    bic: env.TBA_RIB_BIC,
    bank: env.TBA_RIB_BANK,
  };
}

function collectRefs(value: string | null | undefined, found: Set<string>) {
  if (!value) return;
  for (const match of value.matchAll(DOSSIER_REF)) {
    found.add(match[0].toUpperCase());
  }
}

function sectionRefs(section: StatementSection, found: Set<string>) {
  for (const stay of section.stays) {
    collectRefs(stay.meta, found);
    collectRefs(stay.title, found);
    for (const row of stay.rows) collectRefs(row.meta, found);
  }
  for (const row of section.rows) collectRefs(row.meta, found);
}

/**
 * Un seul dossier sur le relevé : sa référence. Sinon le numéro du relevé.
 */
export function statementTransferReference(model: Pick<StatementModel, "number" | "sections">) {
  const found = new Set<string>();
  for (const section of model.sections) sectionRefs(section, found);
  if (found.size === 1) return [...found][0];
  return model.number.trim();
}

/** Bloc imprimable. Sans IBAN valide, le relevé ne montre pas le règlement. */
export function statementTransfer(
  wire: StatementWire | null | undefined,
  reference: string
): StatementTransfer | null {
  if (!wire) return null;
  const iban = groupIban(wire.iban);
  const ref = reference.trim();
  if (!iban || !ref) return null;
  return {
    holder: wire.holder.trim(),
    iban,
    bic: wire.bic.trim(),
    bank: wire.bank.trim(),
    reference: ref,
  };
}

async function readInvoiceRib(): Promise<StatementRibParts | null> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("crm_invoice_settings")
      .select("iban, bic, account_holder")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { iban?: string | null; bic?: string | null; account_holder?: string | null };
    return { holder: row.account_holder, iban: row.iban, bic: row.bic };
  } catch {
    return null;
  }
}

/** Lecture du RIB. Un échec Revolut laisse le repli, sans journaliser l’IBAN. */
export async function loadStatementWire(): Promise<StatementWire | null> {
  const env = statementEnvRib();
  let revolut: StatementRibParts | null = null;
  try {
    const { loadAgencyEurWire, revolutConfigured } = await import("./revolut");
    if (revolutConfigured()) {
      const wire = await loadAgencyEurWire();
      if (wire?.iban) {
        revolut = { holder: wire.accountHolder, iban: wire.iban, bic: wire.bic };
      }
    }
  } catch {
    revolut = null;
  }
  const fromRevolut = statementWireFromParts(revolut, null, { bank: env.bank });
  if (fromRevolut?.source === "revolut") return fromRevolut;
  const settings = await readInvoiceRib();
  return statementWireFromParts(null, settings, env);
}

/** Pose le bloc sur le modèle. Sans coordonnées, le relevé part tel quel. */
export async function attachStatementTransfer(model: StatementModel): Promise<StatementModel> {
  try {
    const transfer = statementTransfer(await loadStatementWire(), statementTransferReference(model));
    return transfer ? { ...model, transfer } : model;
  } catch {
    console.error("[releve] rib");
    return model;
  }
}
