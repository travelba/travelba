import { validBic, validIban } from "./invoice-document";
import { groupIban } from "./revolut-wire";
import type { StatementModel } from "./statement";
import { renderStatementPdf } from "./statement-pdf";
import { siteConfig } from "@/lib/site";

/** Coordonnées imprimées sur le relevé. L’IBAN n’est pas journalisé. */
export type StatementWire = {
  iban: string;
  bic: string;
  holder: string;
};

const WIRE_NOTE =
  "Indiquez cette référence sur l'ordre de virement. L'agence le rapproche dès réception sur son compte Revolut.";
const WIRE_MISSING = "Les coordonnées de virement sont confirmées par l'agence.";

function usableWire(wire: StatementWire | null | undefined): StatementWire | null {
  const iban = validIban(wire?.iban);
  if (!iban) return null;
  return {
    iban,
    bic: validBic(wire?.bic) || "",
    holder: (wire?.holder || "").trim(),
  };
}

/** Lignes du bloc Virement. Sans IBAN lisible, l’agence confirme les coordonnées. */
export function statementWireLines(wire: StatementWire | null, reference: string, amount: string | null) {
  const ready = usableWire(wire);
  if (!ready) return [WIRE_MISSING];
  const holder = ready.holder || siteConfig.name;
  const ref = reference.trim();
  return [
    amount ? `Montant à virer ${amount}` : "",
    `Titulaire ${holder}`,
    `IBAN ${groupIban(ready.iban)}`,
    ready.bic ? `BIC ${ready.bic}` : "",
    ref ? `Référence ${ref}` : "",
    WIRE_NOTE,
  ].filter(Boolean);
}

async function loadRevolutWire(): Promise<StatementWire | null> {
  try {
    const { loadAgencyEurWire } = await import("./revolut");
    const wire = await loadAgencyEurWire();
    return usableWire(
      wire ? { iban: wire.iban, bic: wire.bic, holder: wire.accountHolder } : null
    );
  } catch {
    console.error("[releve] rib indisponible");
    return null;
  }
}

async function loadSettingsWire(): Promise<StatementWire | null> {
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
    return usableWire({
      iban: row.iban || "",
      bic: row.bic || "",
      holder: row.account_holder || "",
    });
  } catch {
    console.error("[releve] rib reglage");
    return null;
  }
}

/**
 * RIB du compte euros Revolut Main.
 * Le réglage Facture ne sert que si Revolut ne fournit pas d’IBAN.
 */
export async function loadStatementWire(deps?: {
  revolut?: () => Promise<StatementWire | null>;
  settings?: () => Promise<StatementWire | null>;
}): Promise<StatementWire | null> {
  const live = usableWire(await (deps?.revolut ?? loadRevolutWire)());
  if (live) return live;
  return usableWire(await (deps?.settings ?? loadSettingsWire)());
}

/** Pose le RIB sur un relevé de compte. Le relevé de frais d’un collaborateur reste sans virement. */
export async function attachStatementWire(
  model: StatementModel,
  load: () => Promise<StatementWire | null> = loadStatementWire
): Promise<StatementModel> {
  if (!model.includeWire) return { ...model, wireLines: [] };
  let wire: StatementWire | null = null;
  try {
    wire = await load();
  } catch {
    console.error("[releve] rib indisponible");
    wire = null;
  }
  return {
    ...model,
    wireLines: statementWireLines(wire, model.holderName, model.wireAmount),
  };
}

/** PDF du relevé, avec le RIB Revolut quand le compte peut virer. */
export async function renderAccountStatementPdf(model: StatementModel) {
  return renderStatementPdf(await attachStatementWire(model));
}
