"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import { leGestureMailto, leHiddenCancel } from "@/lib/crm/le-cancel-reason";

export function LeCancelNotice({
  isCancellable,
  deadline,
  policies,
  bookedAt,
  hotelName,
}: {
  isCancellable: boolean | null;
  deadline: string | null;
  policies: string[];
  bookedAt?: string | null;
  hotelName: string | null;
}) {
  const hidden = leHiddenCancel({
    isCancellable,
    deadline,
    policies,
    bookedAt,
    now: new Date(),
  });
  if (hidden.kind === "open") return null;
  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm text-[var(--admin-navy)]">{hidden.text}</p>
      {policies.map((policy) => (
        <p key={policy} className="text-sm text-muted">
          {policy}
        </p>
      ))}
      <a href={leGestureMailto(hotelName)} className="inline-block text-sm font-semibold text-[#9e7e51] underline">
        Demander un geste
      </a>
    </div>
  );
}

export function LittleEmperorsCancel({
  id,
  hotelName,
  isCancellable,
  deadline,
  policies,
  state,
  bookedAt,
}: {
  id: string;
  hotelName: string | null;
  isCancellable: boolean | null;
  deadline: string | null;
  policies: string[];
  state: string | null;
  bookedAt?: string | null;
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
      {isCancellable === true ? (
        <>
          {policies.map((policy) => (
            <p key={policy} className="mt-1 text-sm text-muted">
              {policy}
            </p>
          ))}
          {deadline ? <p className="mt-1 text-sm text-muted">Limite · {deadline}</p> : null}
        <ConfirmAction
          wrapperClassName="mt-3"
          label="Annuler chez Little Emperors"
          confirmLabel="Confirmer l’annulation"
          busyLabel="Annulation Little Emperors…"
          question={`La réservation ${hotelName || "de cet hôtel"} est annulée chez Little Emperors. La politique d’annulation s’applique.`}
          onConfirm={cancel}
        />
        </>
      ) : (
        <LeCancelNotice
          isCancellable={isCancellable}
          deadline={deadline}
          policies={policies}
          bookedAt={bookedAt}
          hotelName={hotelName}
        />
      )}
    </div>
  );
}
