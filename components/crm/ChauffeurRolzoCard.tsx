"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { kindIcon } from "@/lib/crm/carnet";
import { serviceClock, type ServiceOffer } from "@/lib/crm/extras";
import { formatMoney } from "@/lib/crm/money";
import { chauffeurIframeMessage, rolzoIframeSrc, rolzoStatusLabel } from "@/lib/crm/rolzo-prefill";
import { BOOKING_ITEM_LABELS, type CrmBookingItem } from "@/lib/crm/types";

function detailLine(item: CrmBookingItem | null, key: string) {
  const value = item?.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stayLabel(offer: ServiceOffer) {
  if (offer.place !== "hotel") return null;
  return offer.address?.trim() || offer.route.split("→")[0]?.trim() || null;
}

export function ChauffeurRolzoCard({
  offer,
  existing,
  variant,
  bookingId,
  reference,
  currency,
  locked,
}: {
  offer: ServiceOffer;
  existing: CrmBookingItem | null;
  variant: "admin" | "client";
  bookingId: string;
  reference: string;
  currency: string;
  locked: boolean;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [panel, setPanel] = useState<"new" | "details" | null>(null);
  const [encoded, setEncoded] = useState<string | null>(null);
  const [webHost, setWebHost] = useState<string | null>(null);
  const [busy, setBusy] = useState<"session" | "save" | "fees" | "cancel" | "refresh" | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<string | null>(detailLine(existing, "vehicle"));
  const [driver, setDriver] = useState<string | null>(detailLine(existing, "driver"));
  const [status, setStatus] = useState<string | null>(detailLine(existing, "rolzo_status"));
  const [amount, setAmount] = useState<number | null>(
    existing?.details?.rolzo === true && existing.amount != null && Number.isFinite(Number(existing.amount))
      ? Number(existing.amount)
      : null
  );
  const [priceCurrency, setPriceCurrency] = useState(
    detailLine(existing, "currency") || currency
  );
  const booked = existing?.details?.rolzo === true;
  const rolzoId = detailLine(existing, "rolzo_id");
  const clock = serviceClock(offer.whenIso);
  const isAdmin = variant === "admin";
  const base =
    variant === "admin"
      ? `/api/admin/bookings/${bookingId}/chauffeur`
      : `/api/client/bookings/${reference}/chauffeur`;
  const live = useRef({ base, reference, offer, rolzoId });
  useEffect(() => {
    live.current = { base, reference, offer, rolzoId };
  });

  const applyItem = useCallback((item: CrmBookingItem | null | undefined) => {
    if (!item) return;
    setVehicle(detailLine(item, "vehicle"));
    setDriver(detailLine(item, "driver"));
    setStatus(detailLine(item, "rolzo_status"));
    setAmount(item.amount != null && Number.isFinite(Number(item.amount)) ? Number(item.amount) : null);
    setPriceCurrency(detailLine(item, "currency") || currency);
  }, [currency]);

  useEffect(() => {
    if (!panel || !encoded || !webHost) return;
    const origin = new URL(webHost).origin;
    const current = live.current;
    const booking = panel === "details" ? current.rolzoId : null;
    const place = current.offer.place;
    if (!place) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      const msg = (event.data || {}) as { type?: string; bookingId?: string; message?: string };
      if (msg.type === "REACT_APP_READY") {
        const snap = live.current;
        if (!snap.offer.place) return;
        iframeRef.current?.contentWindow?.postMessage(
          chauffeurIframeMessage({
            encodedInfo: encoded as string,
            reference: snap.reference,
            leg: snap.offer.leg,
            place: snap.offer.place,
            airport: snap.offer.airport,
            stayLabel: stayLabel(snap.offer),
            whenIso: snap.offer.whenIso,
            bookingId: panel === "details" ? snap.rolzoId : null,
          }),
          origin
        );
      }
      if (msg.type === "BOOKING_CONFIRMED" && msg.bookingId && panel === "new") {
        const snap = live.current;
        setBusy("save");
        void fetch(snap.base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: String(msg.bookingId),
            leg: snap.offer.leg,
            place: snap.offer.place,
          }),
        })
          .then(async (res) => {
            const json = await res.json().catch(() => ({}));
            setBusy(null);
            if (!res.ok) {
              setIssues(issuesFromResponse(json));
              return;
            }
            applyItem(json.item);
            setPanel(null);
            router.refresh();
          })
          .catch(() => {
            setBusy(null);
            setIssues([{ field: "rolzo", message: "La course n’a pas pu être enregistrée." }]);
          });
      }
      if (msg.type === "ERROR" && msg.message) {
        setIssues([{ field: "rolzo", message: "La commande chauffeur n’a pas abouti. Réessayez." }]);
      }
    }
    window.addEventListener("message", onMessage);
    const frame = iframeRef.current;
    if (frame) frame.src = rolzoIframeSrc(origin, booking);
    return () => window.removeEventListener("message", onMessage);
  }, [panel, encoded, webHost, router, applyItem]);

  async function openSession(next: "new" | "details") {
    setBusy("session");
    setIssues([]);
    const res = await fetch(`${base}/session`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || typeof json.encodedData !== "string" || typeof json.webHost !== "string") {
      setIssues(issuesFromResponse(json));
      return;
    }
    setEncoded(json.encodedData);
    setWebHost(json.webHost);
    setPanel(next);
  }

  async function refresh() {
    if (!booked || busy) return;
    setBusy("refresh");
    const params = new URLSearchParams({ leg: offer.leg, place: offer.place || "" });
    const res = await fetch(`${base}?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    applyItem(json.item);
  }

  async function loadFees() {
    setBusy("fees");
    setIssues([]);
    const res = await fetch(`${base}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leg: offer.leg, place: offer.place }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    setNotice(typeof json.notice === "string" && json.notice.trim() ? json.notice : "");
  }

  async function confirmCancel() {
    setBusy("cancel");
    setIssues([]);
    const res = await fetch(`${base}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirm: true,
        shown: notice,
        leg: offer.leg,
        place: offer.place,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    setNotice(null);
    applyItem(json.item);
    router.refresh();
  }

  async function refuse() {
    if (existing || isAdmin) return;
    setIssues([]);
    const res = await fetch(`/api/client/bookings/${reference}/extras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decline: true,
        kind: "chauffeur",
        leg: offer.leg,
        place: offer.place,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  const statusLabel = booked
    ? rolzoStatusLabel(status) || "Commandé"
    : locked
      ? "Jusqu’à 48 h avant le vol"
      : "Non commandé";
  const priceLabel = amount != null ? formatMoney(amount, priceCurrency || currency) : null;
  const Shell = booked ? "details" : "article";
  const Header = booked ? "summary" : "div";

  return (
    <Shell
      className="w-full min-w-0 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white [&_summary]:list-none"
      onToggle={
        booked
          ? (event) => {
              if ((event.currentTarget as HTMLDetailsElement).open) void refresh();
            }
          : undefined
      }
    >
      <Header className="flex min-w-0 items-start gap-3 px-3.5 py-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
          <Icon name={kindIcon("chauffeur")} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-gold)]">{statusLabel}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {BOOKING_ITEM_LABELS.chauffeur}
            {clock ? ` · ${clock}` : ""}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{offer.route}</p>
          {!booked && vehicle ? <p className="truncate text-xs text-muted">{vehicle}</p> : null}
          {!booked && driver ? <p className="truncate text-xs text-muted">Chauffeur {driver}</p> : null}
          {offer.flightLine ? <p className="truncate text-xs text-muted">{offer.flightLine}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {priceLabel ? <span className="text-sm font-bold text-[var(--admin-navy)]">{priceLabel}</span> : null}
            {!booked && !locked ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void openSession("new")}
                className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--admin-navy)] px-3 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
              >
                {busy === "session" ? "…" : "Commander le chauffeur"}
              </button>
            ) : null}
            {!booked && !locked && !isAdmin ? (
              <button
                type="button"
                onClick={() => void refuse()}
                className="inline-flex h-7 items-center text-[11px] font-semibold leading-none text-muted"
              >
                Refuser
              </button>
            ) : null}
          </div>
        </div>
      </Header>
      {booked ? (
        <div className="space-y-2 border-t border-[#e5e3dc] px-3.5 py-3 text-sm text-[var(--admin-navy)]">
          {vehicle ? <p>{vehicle}</p> : null}
          {driver ? <p>Chauffeur {driver}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void openSession("details")}
              className="inline-flex h-7 items-center text-[11px] font-semibold leading-none text-[var(--aura-blue)]"
            >
              Revoir le détail
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void loadFees()}
              className="inline-flex h-7 items-center text-[11px] font-semibold leading-none text-[var(--admin-navy)]"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {notice !== null ? (
        <div className="space-y-2 border-t border-[#e5e3dc] px-3.5 py-3 text-sm text-[var(--admin-navy)]">
          <p>{notice.trim() ? notice : "ROLZO n’a pas indiqué de frais d’annulation."}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void confirmCancel()}
            className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--admin-navy)] px-3 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
          >
            {busy === "cancel" ? "…" : "Confirmer l’annulation"}
          </button>
        </div>
      ) : null}
      {panel && webHost ? (
        <iframe
          ref={iframeRef}
          title={panel === "details" ? "Détail du chauffeur" : "Commander le chauffeur"}
          className="h-[700px] w-full border-0 border-t border-[#e5e3dc]"
        />
      ) : null}
      {busy ? (
        <div className="px-3.5 pb-3">
          <BusyBar
            label={
              busy === "cancel"
                ? "Annulation…"
                : busy === "fees"
                  ? "Lecture des frais…"
                  : busy === "save"
                    ? "Enregistrement…"
                    : busy === "refresh"
                      ? "Mise à jour…"
                      : "Ouverture…"
            }
          />
        </div>
      ) : null}
      {issues.length ? (
        <div className="px-3.5 pb-3">
          <IssuesList issues={issues} />
        </div>
      ) : null}
    </Shell>
  );
}
