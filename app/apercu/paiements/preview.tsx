"use client";

import { useState } from "react";
import { CompanyDossierPrompt } from "@/components/admin/CompanyDossierPrompt";
import { UnattachedPaymentAlert } from "@/components/admin/AttachCreditButton";
import { EncoursPayment } from "@/components/account/EncoursPayment";

export function PaymentPreview() {
  const [choices, setChoices] = useState<Record<string, string>>({ a: "imf" });
  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
      <section id="alerte" className="space-y-3">
        <h1 className="font-display text-lg font-bold text-[var(--admin-navy)]">Argent</h1>
        <UnattachedPaymentAlert count={2} />
        <button
          type="button"
          className="admin-tap inline-flex items-center rounded-full border border-[var(--admin-gold)]/50 bg-[#f8f4ed] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
        >
          Rattacher
        </button>
      </section>
      <section id="transactions" className="max-w-[480px] rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">Grand livre</p>
          <p className="font-display text-[1.75rem] font-bold tracking-tight text-[var(--admin-navy)]">−5 251,00 €</p>
          <div className="mt-3">
          <EncoursPayment
            compact
            pooled
            total={5251}
            company={0}
            personal={0}
            currency="EUR"
            soleCompanyName="IMF"
            stripeKey={null}
          />
        </div>
      </section>
      <section id="societe" className="lg:col-span-2">
        <CompanyDossierPrompt
          companies={[{ key: "imf", name: "Société IMF" }]}
          dossiers={[
            { id: "a", reference: "TB-2026-0142", title: "Tel Aviv" },
            { id: "b", reference: "TB-2026-0188", title: "Lisbonne" },
          ]}
          choices={choices}
          onChoose={(dossierId, choice) => setChoices((current) => ({ ...current, [dossierId]: choice }))}
        />
      </section>
    </div>
  );
}
