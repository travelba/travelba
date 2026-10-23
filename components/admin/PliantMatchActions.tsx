"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/crm/ConfirmDialog";
import { StatusChip } from "@/components/crm/ui";
import { formatMoney } from "@/lib/crm/money";
import { pliantLinkPhase, pliantLinkPhaseLabel } from "@/lib/crm/pliant-link";
import { costSuggestionReasonLabel, type OutgoingLine } from "@/lib/crm/trip-costs";
import type { TargetOption } from "@/components/admin/OutgoingAttach";

const STAY = "__stay__";
const PRIMARY = "admin-tap admin-af-btn inline-flex min-h-11 items-center rounded-full px-4 text-sm disabled:opacity-50";
const SECONDARY =
  "admin-tap inline-flex min-h-11 items-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50";

type LinkedCost = { id: string; bookingId: string; reference: string; itemLabel: string | null };

type ConfirmState = {
  kind: "accept" | "refuse" | "detach" | "attach" | "move";
  title: string;
  question: string;
  confirmLabel: string;
  tone: "danger" | "default";
  bookingId?: string;
  itemId?: string | null;
  stay?: boolean;
};

function money(amount: number) {
  try {
    return formatMoney(amount, "EUR");
  } catch {
    return `${amount} €`;
  }
}

function place(reference: string, title: string, client?: string) {
  return [reference, title, client].map((value) => (value || "").trim()).filter(Boolean).join(" · ");
}

/**
 * Gestes sur une dépense Pliant : accepter ou refuser la proposition,
 * rattacher, changer de dossier, détacher. Le montant ne se partage pas.
 */
export function PliantMatchActions({
  id,
  linked,
  outgoing,
  auditLabel,
}: {
  id: string;
  linked: LinkedCost | null;
  outgoing: OutgoingLine | null;
  auditLabel: string | null;
}) {
  const router = useRouter();
  const phase = pliantLinkPhase({ matchStatus: linked ? "matched" : outgoing ? "unmatched" : null, linked: Boolean(linked) });
  const suggestion = outgoing?.suggestions[0] || null;
  const [picker, setPicker] = useState<null | "attach" | "move">(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TargetOption[]>([]);
  const [bookingId, setBookingId] = useState("");
  const [lineId, setLineId] = useState(STAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  useEffect(() => {
    if (!picker || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/comptabilite/cibles?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json: { bookings?: TargetOption[] }) => setOptions(json.bookings || []))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [picker, query]);

  const booking = useMemo(() => options.find((row) => row.id === bookingId) || null, [options, bookingId]);

  async function post(body: Record<string, unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comptabilite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || failure);
        return;
      }
      setConfirm(null);
      setPicker(null);
      setQuery("");
      setBookingId("");
      setLineId(STAY);
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "detach") {
      if (!linked) return;
      void post({ action: "detach", cost_id: linked.id }, "Impossible de détacher cette dépense.");
      return;
    }
    if (confirm.kind === "refuse") {
      if (!suggestion) return;
      void post(
        { action: "refuse", source: "pliant", id, booking_id: suggestion.bookingId },
        "Impossible d’écarter cette proposition."
      );
      return;
    }
    const targetId = confirm.bookingId;
    if (!targetId) return;
    const body: Record<string, unknown> = {
      action: confirm.kind === "move" ? "move" : "attach",
      source: "pliant",
      id,
      booking_id: targetId,
    };
    if (confirm.stay) body.stay = true;
    else if (confirm.itemId) body.item_id = confirm.itemId;
    void post(body, confirm.kind === "move" ? "Impossible de changer de dossier." : "Rattachement impossible. Réessayez.");
  }

  function askLink(kind: "attach" | "move" | "accept") {
    const target = kind === "accept" ? suggestion : booking;
    if (!target) {
      setError("Choisissez le dossier.");
      return;
    }
    setError(null);
    const bookingTarget = "reference" in target ? target : null;
    const reference = bookingTarget?.reference || "";
    const title = "title" in target ? target.title : "";
    const label = place(reference, title || "");
    const stay = kind === "accept" ? !suggestion?.itemId : lineId === STAY;
    const itemId = kind === "accept" ? suggestion?.itemId || null : stay ? null : lineId;
    setConfirm({
      kind: kind === "accept" ? "accept" : kind,
      title: kind === "move" ? "Changer de dossier" : "Rattacher à un dossier",
      question:
        kind === "move"
          ? `Déplacer cette dépense vers ${label} ? Le montant entier suit.`
          : `Rattacher cette dépense à ${label} ? Le montant entier suit.`,
      confirmLabel: kind === "move" ? "Déplacer" : "Rattacher",
      tone: "default",
      bookingId: "bookingId" in target ? target.bookingId : target.id,
      itemId,
      stay,
    });
  }

  function openPicker(next: "attach" | "move") {
    setError(null);
    setPicker(next);
    setQuery("");
    setOptions([]);
    setBookingId("");
    setLineId(STAY);
  }

  return (
    <div className="space-y-2" data-pliant-link={phase} data-spend={id}>
      {phase === "a_proposer" ? <StatusChip tone="gold">{pliantLinkPhaseLabel(phase)}</StatusChip> : null}
      {linked ? (
        <p className="text-sm font-semibold text-[var(--admin-navy)]">
          <Link href={`/admin/reservations/${linked.bookingId}?tab=reglement`} className="underline">
            {linked.reference}
          </Link>
          {linked.itemLabel ? <span className="block text-xs font-normal text-muted">{linked.itemLabel}</span> : null}
        </p>
      ) : null}
      {phase === "a_proposer" && suggestion ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9e7e51]">Proposition</p>
          <p className="text-sm font-semibold leading-snug text-[var(--admin-navy)]">{place(suggestion.reference, suggestion.title)}</p>
          {suggestion.itemLabel ? <p className="text-xs leading-5 text-muted">{suggestion.itemLabel}</p> : null}
          <p className="text-xs leading-5 text-muted">{costSuggestionReasonLabel(suggestion.reason)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => askLink("accept")}>
              Accepter
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirm({
                  kind: "refuse",
                  title: "Écarter la proposition",
                  question: `Écarter ${suggestion.reference} ? La dépense reste à proposer.`,
                  confirmLabel: "Écarter",
                  tone: "default",
                });
              }}
            >
              Refuser
            </button>
          </div>
        </div>
      ) : null}
      {phase === "a_proposer" && !suggestion ? <p className="text-xs text-muted">Aucune proposition</p> : null}
      <div className="flex flex-wrap gap-2">
        {phase === "a_proposer" ? (
          <button type="button" className={PRIMARY} disabled={busy} onClick={() => openPicker("attach")}>
            Rattacher à un dossier
          </button>
        ) : null}
        {linked ? (
          <>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => openPicker("move")}>
              Changer de dossier
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirm({
                  kind: "detach",
                  title: "Détacher la dépense",
                  question: `Détacher cette dépense de ${linked.reference} ? Elle revient à proposer.`,
                  confirmLabel: "Détacher",
                  tone: "danger",
                });
              }}
            >
              Détacher
            </button>
          </>
        ) : null}
      </div>
      {picker ? (
        <div className="space-y-2 rounded-2xl border border-border bg-white p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Référence, destination, nom du client…"
            aria-label="Chercher un dossier"
            className="min-h-11 w-full rounded-xl border border-border px-3 text-sm"
          />
          {query.trim().length < 2 ? <p className="text-xs text-muted">Saisissez une référence, une destination ou un nom.</p> : null}
          {query.trim().length >= 2 && !options.length ? (
            <p className="text-xs text-muted">Aucun dossier pour « {query.trim()} ».</p>
          ) : null}
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {options.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    setBookingId(row.id);
                    setLineId(STAY);
                  }}
                  className={`admin-tap min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm ${
                    bookingId === row.id ? "bg-[#C5A880]/20 font-semibold text-[var(--admin-navy)]" : "text-[var(--admin-navy)]"
                  }`}
                >
                  {place(row.reference, row.title, row.client)}
                </button>
              </li>
            ))}
          </ul>
          {booking ? (
            <div className="space-y-1">
              <p className="text-xs text-muted">Ligne du dossier</p>
              <button
                type="button"
                onClick={() => setLineId(STAY)}
                className={`admin-tap min-h-11 w-full rounded-xl border px-3 text-left text-sm ${
                  lineId === STAY ? "border-[#C5A880] font-semibold" : "border-border"
                }`}
              >
                Montant du séjour
              </button>
              {booking.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLineId(item.id)}
                  className={`admin-tap min-h-11 w-full rounded-xl border px-3 text-left text-sm ${
                    lineId === item.id ? "border-[#C5A880] font-semibold" : "border-border"
                  }`}
                >
                  {item.label}
                  {item.amount != null ? ` · ${money(item.amount)}` : ""}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY}
              disabled={busy || !booking}
              onClick={() => askLink(picker)}
            >
              {picker === "move" ? "Déplacer" : "Rattacher"}
            </button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => setPicker(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {auditLabel ? <p className="text-xs leading-5 text-muted">{auditLabel}</p> : null}
      {error && !confirm ? (
        <p role="alert" className="text-xs text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        question={confirm?.question || ""}
        confirmLabel={confirm?.confirmLabel || "Confirmer"}
        tone={confirm?.tone || "default"}
        busy={busy}
        busyLabel="En cours…"
        error={error}
        onConfirm={runConfirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </div>
  );
}
