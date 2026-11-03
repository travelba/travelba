"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";

export function VoidMovementButton({ transactionId, amountLabel }: { transactionId: string; amountLabel: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="px-4 pb-3">
      <ConfirmAction
        label="Annuler ce mouvement"
        confirmLabel="Annuler le débit"
        question={amountLabel ? `Annuler ${amountLabel} ?` : "Annuler ce débit ?"}
        hint="Le montant quitte le solde du client. Le mouvement reste au journal, annulé."
        tone="danger"
        size="sm"
        busyLabel="Annulation…"
        ariaLabel="Annuler ce mouvement"
        onConfirm={async () => {
          setError(null);
          const response = await fetch(`/api/admin/transactions/${transactionId}/annuler`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmer: true }),
          });
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            setError(body?.error || "Annulation impossible.");
            return body?.error || "Annulation impossible.";
          }
          router.refresh();
          return null;
        }}
      />
      {error ? <p className="mt-2 text-sm text-[var(--admin-red)]">{error}</p> : null}
    </div>
  );
}
