"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import { formatMoney } from "@/lib/crm/money";
import { isLedgerExpenseKind, type BookingStatus, type CrmBookingItem } from "@/lib/crm/types";

function postsNow(status: BookingStatus) {
  return status === "confirmed" || status === "travelling" || status === "completed";
}

export function BookingExpensesPanel({
  bookingId,
  items,
  status,
  currency = "EUR",
}: {
  bookingId: string;
  items: CrmBookingItem[];
  status: BookingStatus;
  currency?: string;
}) {
  const router = useRouter();
  const expenses = items.filter((item) => isLedgerExpenseKind(item.kind));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginNew() {
    setEditingId("new");
    setTitle("");
    setAmount(null);
    setError(null);
  }

  function beginEdit(item: CrmBookingItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setAmount(item.amount);
    setError(null);
  }

  async function save() {
    const label = title.trim();
    if (!label) {
      setError("Libellé requis.");
      return;
    }
    if (amount == null || amount <= 0) {
      setError("Montant requis.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      kind: "expense",
      title: label,
      amount,
      include_in_ledger: true,
      supplier: null,
      confirmation_ref: null,
      start_at: null,
      end_at: null,
      details: {},
    };
    const res =
      editingId && editingId !== "new"
        ? await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return;
    }
    setEditingId(null);
    setTitle("");
    setAmount(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/bookings/${bookingId}/items?itemId=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    if (editingId === id) setEditingId(null);
    router.refresh();
  }

  const form = editingId ? (
    <div className="mt-3 space-y-3 rounded-2xl border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Libellé">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldControlClass}
            aria-label="Libellé de la dépense"
          />
        </Field>
        <Field label="Montant">
          <MoneyInput value={amount} onChange={setAmount} aria-label="Montant de la dépense" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : editingId === "new" ? "Ajouter la dépense" : "Enregistrer"}
        </button>
        <button type="button" className="text-sm font-semibold" onClick={() => setEditingId(null)}>
          Annuler
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Dépenses</h2>
        <button
          type="button"
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
          onClick={beginNew}
        >
          Ajouter une dépense
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Hors itinéraire. La dépense est débitée dans les transactions du client, dans le cadre de ce
        voyage.
        {postsNow(status)
          ? " Le dossier est confirmé : le débit part à l’enregistrement."
          : " Le débit part à la confirmation du dossier."}
      </p>
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {expenses.length ? (
        <ul className="mt-2 space-y-2 text-sm">
          {expenses.map((item) =>
            editingId === item.id ? (
              <li key={item.id}>{form}</li>
            ) : (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.title}
                    <span className="ml-2 rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[10px] font-bold uppercase">
                      Transactions
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {item.amount != null ? formatMoney(Number(item.amount), currency) : "Montant manquant"}
                    {" · "}
                    Absente de l’itinéraire
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--admin-navy)]"
                    onClick={() => beginEdit(item)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-accent"
                    onClick={() => void remove(item.id)}
                  >
                    Retirer
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Aucune dépense hors itinéraire.</p>
      )}
      {editingId === "new" ? form : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
    </section>
  );
}
