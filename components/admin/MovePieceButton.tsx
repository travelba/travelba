"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { adminAction } from "@/lib/crm/admin-action";
import { useIsClient } from "@/lib/crm/use-is-client";

type CardChoice = { id: string; title: string | null; kind: string };
type BookingChoice = { id: string; label: string; status: string; items: CardChoice[] };

export function MovePieceButton({
  pieceId,
  label,
  customerId,
  sourceBookingId,
}: {
  pieceId: string;
  label: string;
  customerId: string;
  sourceBookingId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-center text-[11px] font-semibold leading-tight text-[var(--admin-navy)] underline-offset-2 hover:underline"
        aria-label={`Déplacer vers un autre dossier : ${label}`}
      >
        Déplacer vers un autre dossier
      </button>
      {open ? (
        <MovePieceDialog
          pieceId={pieceId}
          label={label}
          customerId={customerId}
          sourceBookingId={sourceBookingId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function MovePieceDialog({
  pieceId,
  label,
  customerId,
  sourceBookingId,
  onClose,
}: {
  pieceId: string;
  label: string;
  customerId: string;
  sourceBookingId: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const mounted = useIsClient();
  const [bookings, setBookings] = useState<BookingChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dossierId, setDossierId] = useState("");
  const [carteId, setCarteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/email-ingest/bookings?customer_id=${encodeURIComponent(customerId)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { bookings?: BookingChoice[] };
        if (!res.ok || !Array.isArray(json.bookings)) throw new Error("load");
        if (!cancelled) setBookings(json.bookings.filter((row) => row.id !== sourceBookingId));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, sourceBookingId]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const cards = bookings.find((row) => row.id === dossierId)?.items || [];

  async function move() {
    if (!dossierId || busy) return;
    setBusy(true);
    setError(null);
    const result = await adminAction(`/api/admin/bookings/${sourceBookingId}/documents/move`, {
      method: "POST",
      body: { piece_id: pieceId, dossier_cible: dossierId, carte_id: carteId || null },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Déplacement impossible.");
      return;
    }
    onClose();
    router.refresh();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0B192C]/40 p-4 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="admin-af-card w-full max-w-md space-y-4 rounded-3xl bg-white p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <p id={titleId} className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Déplacer vers un autre dossier
          </p>
          <p className="mt-1 truncate text-sm text-muted">{label}</p>
        </div>
        {loading ? <p className="text-sm text-muted">Chargement des dossiers…</p> : null}
        {failed ? <p className="text-sm text-[var(--admin-red)]">Les dossiers n’ont pas pu être chargés.</p> : null}
        {!loading && !failed && !bookings.length ? (
          <p className="text-sm text-muted">Aucun autre dossier pour ce client.</p>
        ) : null}
        {bookings.length ? (
          <>
            <label className="block text-xs font-semibold text-muted">
              Dossier
              <select
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--admin-navy)]"
                value={dossierId}
                aria-label="Dossier cible"
                onChange={(event) => {
                  setDossierId(event.target.value);
                  setCarteId("");
                }}
              >
                <option value="">Choisir un dossier</option>
                {bookings.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} ({row.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Carte
              <select
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--admin-navy)]"
                value={carteId}
                aria-label="Carte cible"
                disabled={!dossierId}
                onChange={(event) => setCarteId(event.target.value)}
              >
                <option value="">Sans carte</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {(card.title || card.kind || "Carte").trim()}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--admin-red)]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-tap rounded-full px-4 py-2 text-sm font-semibold text-muted" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!dossierId || busy}
            onClick={() => void move()}
            className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? "Déplacement…" : "Déplacer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
