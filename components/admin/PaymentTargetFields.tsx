"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { suggestCreditLink } from "@/lib/crm/attach-credit";

type BookingRow = {
  id: string;
  reference: string;
  label: string;
  payer_kind?: string | null;
  billing_company_id?: string | null;
  status?: string | null;
};

type CompanyRow = { id: string; company_name: string | null };

export type PaymentTargetValue = {
  bookingId: string;
  payerKind: "company" | "personal" | "";
  companyId: string;
};

const EMPTY: PaymentTargetValue = { bookingId: "", payerKind: "", companyId: "" };

/** Dossier et payeur d’un crédit. La proposition est préremplie, l’agence valide. */
export function PaymentTargetFields({
  customerId,
  label,
  value,
  onChange,
  disabled = false,
}: {
  customerId: string;
  label: string;
  value: PaymentTargetValue;
  onChange: (next: PaymentTargetValue) => void;
  disabled?: boolean;
}) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [touched, setTouched] = useState(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setTouched(false);
    }, 0);
    fetch(`/api/admin/revolut/bookings?customer_id=${encodeURIComponent(customerId)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          bookings?: BookingRow[];
          companies?: CompanyRow[];
        };
        if (!res.ok) throw new Error("load");
        if (cancelled) return;
        setBookings(json.bookings || []);
        setCompanies(json.companies || []);
      })
      .catch(() => {
        if (cancelled) return;
        setBookings([]);
        setCompanies([]);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerId]);

  const suggestion = useMemo(
    () => suggestCreditLink({ label, bookings, companies }),
    [label, bookings, companies]
  );

  useEffect(() => {
    if (touched) return;
    if (!suggestion.bookingId && !suggestion.payerKind) return;
    const timer = window.setTimeout(() => {
      onChangeRef.current({
        bookingId: suggestion.bookingId || "",
        payerKind: suggestion.payerKind || "",
        companyId: suggestion.companyId || "",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [suggestion, touched]);

  function edit(next: PaymentTargetValue) {
    setTouched(true);
    onChange(next);
  }

  const shown = touched
    ? value
    : {
        bookingId: suggestion.bookingId || value.bookingId,
        payerKind: suggestion.payerKind || value.payerKind,
        companyId: suggestion.companyId || value.companyId,
      };
  const field = "rounded-xl border border-border bg-white px-3 py-2.5 text-sm";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Dossier
        <select
          aria-label="Dossier du paiement"
          disabled={disabled || !customerId}
          value={shown.bookingId}
          onChange={(event) => {
            const booking = bookings.find((row) => row.id === event.target.value);
            const payerKind =
              booking?.payer_kind === "company" || booking?.payer_kind === "personal"
                ? booking.payer_kind
                : shown.payerKind;
            edit({
              bookingId: event.target.value,
              payerKind,
              companyId: payerKind === "company" ? booking?.billing_company_id || shown.companyId : "",
            });
          }}
          className={field}
        >
          <option value="">{bookings.length ? "Choisir un dossier…" : "Aucun dossier"}</option>
          {bookings.map((booking) => (
            <option key={booking.id} value={booking.id}>
              {booking.reference} · {booking.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Payeur
        <select
          aria-label="Payeur du paiement"
          disabled={disabled || !customerId}
          value={shown.payerKind === "company" ? `company:${shown.companyId}` : shown.payerKind}
          onChange={(event) => {
            const chosen = event.target.value;
            if (chosen === "personal") edit({ ...shown, payerKind: "personal", companyId: "" });
            else if (chosen.startsWith("company:")) {
              edit({ ...shown, payerKind: "company", companyId: chosen.slice("company:".length) });
            } else edit({ ...shown, payerKind: "", companyId: "" });
          }}
          className={field}
        >
          <option value="">Choisir…</option>
          <option value="personal">Particulier</option>
          {companies.map((company) => (
            <option key={company.id} value={`company:${company.id}`}>
              Société · {company.company_name || "Société"}
            </option>
          ))}
        </select>
      </label>
      {!touched && suggestion.reason ? (
        <p className="text-xs text-[#9e7e51] sm:col-span-2">Proposition : {suggestion.reason}. À confirmer avant d’enregistrer.</p>
      ) : null}
    </div>
  );
}

export function emptyPaymentTarget(): PaymentTargetValue {
  return { ...EMPTY };
}

export function paymentTargetReady(value: PaymentTargetValue) {
  if (!value.bookingId) return false;
  if (value.payerKind === "personal") return true;
  return value.payerKind === "company" && Boolean(value.companyId);
}
