"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";

const LATE_CANCEL =
  "La date limite d’annulation est passée. Écrivez à bookings@littleemperors.com : la politique d’annulation s’applique.";

export function LittleEmperorsCancel({
  id,
  hotelName,
  isCancellable,
  deadline,
  policies,
  state,
}: {
  id: string;
  hotelName: string | null;
  isCancellable: boolean | null;
  deadline: string | null;
  policies: string[];
  state: string | null;
}) {
  const router = useRouter();
  const cancelled = (state || "").toLowerCase() === "cancelled" || (state || "").toLowerCase() === "canceled";
  if (cancelled) return null;

  /** Confirmé en place : renvoie l’erreur pour l’afficher sous le bouton. */
  async function cancel() {
    const result = await adminAction("/api/admin/little-emperors", {
      method: "POST",
      body: { action: "cancel", id },
    });
    if (!result.ok) return result.error || "Annulation impossible.";
    router.refresh();
    return undefined;
  }

  return (
    <div className="mb-4 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Little Emperors</p>
      <p className="text-sm font-semibold text-[var(--admin-navy)]">{hotelName || "Hôtel"}</p>
      {policies.map((policy) => (
        <p key={policy} className="mt-1 text-sm text-muted">
          {policy}
        </p>
      ))}
      {deadline ? <p className="mt-1 text-sm text-muted">Limite · {deadline}</p> : null}
      {isCancellable === true ? (
        <ConfirmAction
          wrapperClassName="mt-3"
          label="Annuler chez Little Emperors"
          confirmLabel="Confirmer l’annulation"
          busyLabel="Annulation Little Emperors…"
          question={`La réservation ${hotelName || "de cet hôtel"} est annulée chez Little Emperors. La politique d’annulation s’applique.`}
          onConfirm={cancel}
        />
      ) : (
        <p className="mt-2 text-sm text-muted">
          {isCancellable === false
            ? LATE_CANCEL
            : "Little Emperors n’indique pas que cette réservation peut être annulée depuis l’API."}
        </p>
      )}
    </div>
  );
}
