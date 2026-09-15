"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type Quote = { id: string; title: string; status: string; valid_until: string | null; terms: string | null; client_note: string | null; currency: string; reference: string; version: number };
type Line = { id: string; quote_id: string; title: string; description: string | null; quantity: number; unit_price: number; supplier_cost: number | null; tax_rate: number; optional: boolean; selected: boolean; sort_order: number };

export function QuoteEditor({ initialQuote, initialLines }: { initialQuote: Quote; initialLines: Line[] }) {
  const [quote, setQuote] = useState(initialQuote);
  const [lines, setLines] = useState(initialLines);
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const deliveryRequestId = useRef<string | null>(null);
  const legallyLocked = quote.status === "accepted" || quote.status === "declined";
  const lineEditingLocked = quote.status !== "draft";
  const totals = useMemo(() => lines.reduce((result, line) => {
    const sell = Number(line.quantity) * Number(line.unit_price);
    const cost = Number(line.quantity) * Number(line.supplier_cost || 0);
    if (!line.optional || line.selected) result.total += sell * (1 + Number(line.tax_rate) / 100);
    result.margin += sell - cost;
    return result;
  }, { total: 0, margin: 0 }), [lines]);

  async function request(resource: string, method: "POST" | "PATCH" | "DELETE", payload?: Record<string, unknown>, id?: string) {
    const response = await fetch(`/api/admin/operations/${resource}${id ? `?id=${id}` : ""}`, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Action impossible");
    return data as { item: Quote | Line; delivery_warning?: string | null };
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status") || "draft");
    if (status === "sent") deliveryRequestId.current ||= crypto.randomUUID();
    try {
      const result = await request("quotes", "PATCH", {
        id: quote.id,
        title: form.get("title"),
        valid_until: form.get("valid_until") || null,
        terms: form.get("terms"),
        client_note: form.get("client_note"),
        status,
        ...(deliveryRequestId.current
          ? { _request_id: deliveryRequestId.current }
          : {}),
      });
      const saved = result.item as Quote;
      setQuote(saved);
      if (result.delivery_warning) {
        setMessage(`${result.delivery_warning} Enregistrez à nouveau pour réessayer l’envoi.`);
      } else {
        deliveryRequestId.current = null;
        setMessage(saved.status === "sent" ? "Devis versionné et publié au portail client." : "Devis enregistré.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setPending(false);
    }
  }

  async function saveLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      ...(editingLine ? { id: editingLine.id } : {}),
      quote_id: quote.id,
      title: form.get("title"),
      description: form.get("description"),
      quantity: Number(form.get("quantity")),
      unit_price: Number(form.get("unit_price")),
      supplier_cost: Number(form.get("supplier_cost") || 0),
      tax_rate: Number(form.get("tax_rate") || 0),
      optional: form.get("optional") === "on",
      selected: form.get("selected") === "on",
      sort_order: editingLine?.sort_order ?? lines.length,
    };
    try {
      const result = await request("quote_lines", editingLine ? "PATCH" : "POST", payload);
      const saved = result.item as Line;
      setLines((rows) => editingLine ? rows.map((row) => row.id === saved.id ? saved : row) : [...rows, saved]);
      setEditingLine(null);
      event.currentTarget.reset();
      setMessage("Ligne enregistrée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ligne impossible");
    } finally {
      setPending(false);
    }
  }

  async function deleteLine(line: Line) {
    if (!window.confirm(`Supprimer « ${line.title} » ?`)) return;
    try {
      await request("quote_lines", "DELETE", undefined, line.id);
      setLines((rows) => rows.filter((row) => row.id !== line.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  return (
    <div className="space-y-6">
      {legallyLocked ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Ce devis {quote.status === "accepted" ? "accepté" : "refusé"} est
          verrouillé afin de préserver sa version et sa preuve de décision.
        </p>
      ) : null}
      {!legallyLocked && lineEditingLocked ? (
        <p className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">
          Repassez le devis en brouillon avant de modifier ses prestations,
          puis envoyez-le à nouveau pour créer une nouvelle version.
        </p>
      ) : null}
      <form onSubmit={saveQuote} className="admin-af-card grid gap-4 p-5 md:grid-cols-2">
        <label className="text-sm font-semibold">Titre<input name="title" defaultValue={quote.title} required className="mt-1 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold">Validité<input name="valid_until" type="date" defaultValue={quote.valid_until || ""} className="mt-1 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold">Statut<select name="status" defaultValue={quote.status} disabled={legallyLocked} className="mt-1 w-full rounded-xl border border-border px-3 py-2 font-normal"><option value="draft">Brouillon</option><option value="sent">Envoyer au client</option><option value="expired">Expiré</option>{legallyLocked ? <option value={quote.status}>{quote.status === "accepted" ? "Accepté" : "Refusé"}</option> : null}</select></label>
        <a href={`/api/admin/quotes/${quote.id}/pdf`} className="self-end rounded-full border border-border px-4 py-2 text-center text-sm font-bold">Aperçu PDF</a>
        <label className="text-sm font-semibold md:col-span-2">Conditions<textarea name="terms" defaultValue={quote.terms || ""} className="mt-1 min-h-24 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold md:col-span-2">Note client<textarea name="client_note" defaultValue={quote.client_note || ""} className="mt-1 min-h-20 w-full rounded-xl border border-border px-3 py-2 font-normal" /></label>
        <button disabled={pending || legallyLocked} className="admin-af-btn rounded-full px-4 py-2.5 text-sm disabled:opacity-50">Enregistrer le devis</button>
      </form>

      <section className="admin-af-card overflow-hidden">
        <div className="flex justify-between border-b border-border p-5"><h2 className="font-display text-xl font-bold">Prestations</h2><div className="text-right text-sm"><p>Total TTC <strong>{totals.total.toLocaleString("fr-FR", { style: "currency", currency: quote.currency })}</strong></p><p className="text-muted">Marge brute {totals.margin.toLocaleString("fr-FR", { style: "currency", currency: quote.currency })}</p></div></div>
        <div className="divide-y divide-border">
          {lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-semibold">{line.title}</p><p className="text-xs text-muted">{line.quantity} × {line.unit_price} · TVA {line.tax_rate}%{line.optional ? " · Option" : ""}</p></div>{!lineEditingLocked ? <div className="flex gap-2"><button onClick={() => setEditingLine(line)} className="text-xs font-semibold">Modifier</button><button onClick={() => void deleteLine(line)} className="text-xs font-semibold text-red-700">Supprimer</button></div> : null}</div>)}
        </div>
      </section>

      {!lineEditingLocked ? <form key={editingLine?.id || "new"} onSubmit={saveLine} className="admin-af-card grid gap-3 p-5 md:grid-cols-3">
        <h2 className="font-display text-lg font-bold md:col-span-3">{editingLine ? "Modifier la ligne" : "Ajouter une ligne"}</h2>
        <input name="title" defaultValue={editingLine?.title || ""} required placeholder="Prestation" className="rounded-xl border border-border px-3 py-2" />
        <input name="description" defaultValue={editingLine?.description || ""} placeholder="Description" className="rounded-xl border border-border px-3 py-2" />
        <input name="quantity" type="number" step="0.01" min="0.01" defaultValue={editingLine?.quantity || 1} required className="rounded-xl border border-border px-3 py-2" />
        <input name="unit_price" type="number" step="0.01" defaultValue={editingLine?.unit_price || 0} required placeholder="Prix client" className="rounded-xl border border-border px-3 py-2" />
        <input name="supplier_cost" type="number" step="0.01" defaultValue={editingLine?.supplier_cost || 0} placeholder="Coût fournisseur" className="rounded-xl border border-border px-3 py-2" />
        <input name="tax_rate" type="number" step="0.001" min="0" defaultValue={editingLine?.tax_rate || 0} placeholder="TVA %" className="rounded-xl border border-border px-3 py-2" />
        <label className="text-sm"><input name="optional" type="checkbox" defaultChecked={editingLine?.optional} className="mr-2" />Optionnelle</label>
        <label className="text-sm"><input name="selected" type="checkbox" defaultChecked={editingLine?.selected ?? true} className="mr-2" />Retenue</label>
        <div className="flex gap-2"><button disabled={pending} className="admin-af-btn rounded-full px-4 py-2 text-sm">Enregistrer</button>{editingLine ? <button type="button" onClick={() => setEditingLine(null)} className="text-sm">Annuler</button> : null}</div>
      </form> : null}
      {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
