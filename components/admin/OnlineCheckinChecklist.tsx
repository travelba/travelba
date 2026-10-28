"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OnlineCheckinBadge } from "@/components/admin/OnlineCheckinMark";
import { adminAction } from "@/lib/crm/admin-action";
import type { FlightCheckinView, OnlineCheckinStatus } from "@/lib/crm/online-checkin";

export function OnlineCheckinChecklist({ bookingId, lines }: { bookingId: string; lines: FlightCheckinView[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!lines.length) return null;

  async function mark(line: FlightCheckinView, statut: OnlineCheckinStatus) {
    setBusyId(line.itemId);
    setNote(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}/enregistrement`, {
      method: "POST",
      body: { carte_id: line.itemId, statut },
    });
    setBusyId(null);
    if (!result.ok) {
      setNote(result.error || "Enregistrement impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5" aria-label="Enregistrement en ligne">
      <h2 className="font-display text-lg font-bold text-[#0B192C]">Enregistrement en ligne</h2>
      <ul className="space-y-3">
        {lines.map((line) => {
          const title = [line.route, line.flight].filter(Boolean).join(" · ");
          return (
            <li key={line.itemId} className="flex flex-wrap items-start gap-3 text-sm text-[#0B192C]">
              <input
                type="checkbox"
                checked={line.done}
                onChange={() => undefined}
                onClick={(event) => event.preventDefault()}
                aria-readonly="true"
                aria-label={`Enregistrement en ligne ${title}`}
                className="mt-1 h-4 w-4 accent-[#C5A880]"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">
                  Enregistrement en ligne
                  {title ? <span className="font-normal text-[#3d4654]"> · {title}</span> : null}
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  <OnlineCheckinBadge line={line} />
                  {line.actorLabel ? <span className="text-xs text-[#3d4654]">{line.actorLabel}</span> : null}
                </p>
                {line.openingLabel ? <p className="text-xs text-[#3d4654]">{line.openingLabel}</p> : null}
                {line.alert ? (
                  <p role="status" className="text-xs font-semibold text-[#9e7e51]">
                    Ouvert, pas encore fait
                  </p>
                ) : null}
                {line.done ? null : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {line.status === "en_cours" ? null : (
                      <button
                        type="button"
                        disabled={busyId === line.itemId}
                        className="admin-tap rounded-full border border-[#d9d1c3] bg-white px-3 py-1 text-xs font-semibold text-[#0B192C] disabled:opacity-50"
                        onClick={() => void mark(line, "en_cours")}
                      >
                        Je m’en occupe
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === line.itemId}
                      className="admin-tap rounded-full bg-[#0B192C] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() => void mark(line, "fait")}
                    >
                      C’est fait
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {note ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {note}
        </p>
      ) : null}
    </section>
  );
}
