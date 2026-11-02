"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";

export function UnmatchCreditButton({
  transactionId,
  amountLabel,
  source,
}: {
  transactionId: string;
  amountLabel?: string | null;
  source?: string | null;
}) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const manual = source === "manual";
  return (
    <ConfirmAction
      label="Remettre en non rattaché"
      confirmLabel="Confirmer"
      question={amountLabel ? `Remettre ${amountLabel} en non rattaché ?` : "Remettre ce crédit en non rattaché ?"}
      hint={
        <label className="flex flex-col gap-1 text-left">
          <span>{manual ? "Le virement saisi est annulé et quitte le compte du client." : "Le montant quitte le compte du client. Le paiement revient dans À encaisser."}</span>
          <span className="font-semibold text-muted">Motif, facultatif</span>
          <input
            value={motif}
            onChange={(event) => setMotif(event.target.value)}
            maxLength={300}
            aria-label="Motif"
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-[var(--admin-navy)]"
          />
        </label>
      }
      tone="danger"
      size="sm"
      busyLabel="Remise en file…"
      ariaLabel="Remettre en non rattaché"
      onConfirm={async () => {
        const res = await fetch(`/api/admin/transactions/${transactionId}/non-rattache`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motif: motif.trim() }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return json.error || "Le crédit reste rattaché.";
        setMotif("");
        router.refresh();
      }}
    />
  );
}
