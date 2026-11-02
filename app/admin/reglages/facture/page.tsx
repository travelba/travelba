import { redirect } from "next/navigation";
import { InvoiceSettingsForm } from "@/components/admin/InvoiceSettingsForm";
import { requireStaffPage } from "@/lib/crm/auth";
import { groupIban } from "@/lib/crm/revolut-wire";
import { invoiceIssuerLines } from "@/lib/crm/invoice-document";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Facture" };

export default async function FactureReglagesPage() {
  const { staff } = await requireStaffPage();
  if (staff.role !== "admin") redirect("/admin/reglages/whatsapp");

  let iban = "";
  let bic = "";
  let holder = "";
  let dueDays = "";
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_invoice_settings")
      .select("iban, bic, account_holder, due_days")
      .eq("id", 1)
      .maybeSingle();
    const row = data as { iban?: string | null; bic?: string | null; account_holder?: string | null; due_days?: number | null } | null;
    iban = row?.iban || "";
    bic = row?.bic || "";
    holder = row?.account_holder || "";
    dueDays = row?.due_days == null ? "" : String(row.due_days);
  } catch {
    iban = "";
  }

  let revolut: "présent" | "absent" | "indisponible" = "absent";
  let revolutIban = "";
  try {
    const { loadAgencyEurWire } = await import("@/lib/crm/revolut");
    const wire = await loadAgencyEurWire();
    if (wire?.iban) {
      revolut = "présent";
      revolutIban = groupIban(wire.iban);
    }
  } catch {
    revolut = "indisponible";
  }

  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Facture</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Mentions imprimées sur la facture pro forma. La raison sociale, l’adresse, le SIREN, le SIRET, la TVA, l’IATA,
        Atout France et l’APST viennent de la configuration de l’agence.
      </p>
      <ul className="mt-4 max-w-xl space-y-1 text-sm text-[var(--admin-navy)]">
        {invoiceIssuerLines().map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {revolutIban ? <p className="mt-4 text-sm text-[var(--admin-navy)]">RIB Revolut : {revolutIban}</p> : null}
      <InvoiceSettingsForm iban={iban} bic={bic} holder={holder} dueDays={dueDays} revolut={revolut} />
    </div>
  );
}
