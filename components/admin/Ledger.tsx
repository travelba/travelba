"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmBooking, CrmCustomer, CrmTransaction } from "@/lib/crm/types";
import { TX_KIND_LABELS } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { TransactionReceipt } from "@/components/admin/TransactionReceipt";

export function Ledger({
  transactions,
  customers,
  bookings,
}: {
  transactions: CrmTransaction[];
  customers: CrmCustomer[];
  bookings: Pick<CrmBooking, "id" | "customer_id" | "reference" | "title">[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `Erreur serveur (${response.status})`);
      form.reset();
      setNotice({ error: false, text: "Écriture enregistrée." });
      router.refresh();
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setPending(false);
    }
  }

  async function voidTransaction(transaction: CrmTransaction) {
    if (!window.confirm(`Annuler l’écriture « ${transaction.label} » ? Une trace sera conservée.`)) return;
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/transactions/${transaction.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "void" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Annulation impossible");
      setNotice({ error: false, text: "Écriture annulée et auditée." });
      router.refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Annulation impossible" });
    } finally {
      setPending(false);
    }
  }

  async function refundTransaction(transaction: CrmTransaction) {
    const raw = window.prompt("Montant à rembourser", String(transaction.amount));
    if (raw == null) return;
    const amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ error: true, text: "Montant invalide." });
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: transaction.id, amount }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Remboursement impossible");
      setNotice({ error: false, text: `Remboursement Stripe ${data.refund_status}.` });
      router.refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Remboursement impossible" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-3">
        <select name="customer_id" required className="rounded-xl border border-border px-3 py-2">
          <option value="">Client…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.last_name} {c.first_name}
            </option>
          ))}
        </select>
        <select name="direction" className="rounded-xl border border-border px-3 py-2">
          <option value="debit">Débit</option>
          <option value="credit">Crédit</option>
        </select>
        <select name="kind" className="rounded-xl border border-border px-3 py-2">
          <option value="adjustment">Ajustement</option>
          <option value="booking">Réservation</option>
          <option value="transfer">Virement</option>
          <option value="refund">Remboursement</option>
        </select>
        <input name="amount" type="number" step="0.01" required placeholder="Montant" className="rounded-xl border border-border px-3 py-2" />
        <select name="booking_id" className="rounded-xl border border-border px-3 py-2">
          <option value="">Dossier (requis pour une réservation)…</option>
          {bookings.map((booking) => (
            <option key={booking.id} value={booking.id}>
              {booking.reference} · {booking.title}
            </option>
          ))}
        </select>
        <input name="label" placeholder="Libellé" className="rounded-xl border border-border px-3 py-2" />
        <button disabled={pending} className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-3 disabled:opacity-50">
          {pending ? "Enregistrement…" : "Saisir une écriture"}
        </button>
        {notice ? (
          <p role={notice.error ? "alert" : "status"} className={`text-sm sm:col-span-3 ${notice.error ? "text-accent" : "text-emerald-700"}`}>
            {notice.text}
          </p>
        ) : null}
      </form>
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {transactions.map((t) => (
          <li key={t.id} className="flex justify-between gap-4 px-5 py-3 text-sm">
            <div>
              <p className="font-medium">{t.label}</p>
              <p className="text-xs text-muted">
                {formatDateFr(t.occurred_on)} · {TX_KIND_LABELS[t.kind]} · {t.status}
              </p>
              <TransactionReceipt transactionId={t.id} fileName={t.receipt_file_name} hasFile={Boolean(t.receipt_storage_path)} />
            </div>
            <div className="text-right">
              <p>{t.direction === "credit" ? "+" : "−"}{formatMoney(Number(t.amount), t.currency)}</p>
              <div className="mt-1 flex gap-2">
                {t.status !== "void" ? <button type="button" disabled={pending} onClick={() => void voidTransaction(t)} className="text-xs font-semibold text-red-700 disabled:opacity-50">Annuler</button> : null}
                {t.source === "stripe" && t.direction === "credit" && t.status === "posted" ? <button type="button" disabled={pending} onClick={() => void refundTransaction(t)} className="text-xs font-semibold text-[var(--aura-blue)] disabled:opacity-50">Rembourser</button> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
