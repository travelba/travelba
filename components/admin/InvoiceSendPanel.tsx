"use client";

import { useState } from "react";

type Preview = {
  envoye?: boolean;
  numero?: string;
  reste_label?: string;
  acomptes_label?: string;
  echeance?: string;
  rib?: "present" | "manquant";
  lien_stripe?: string | null;
  objet?: string;
  apercu?: string;
  email?: { pret: boolean; raison: string | null };
  whatsapp?: { pret: boolean; raison: string | null };
  manques?: string[];
  envoi_recent?: boolean;
  message?: string;
  error?: string;
  statut?: string;
};

export function InvoiceSendPanel({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(true);
  const [link, setLink] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setDone(null);
    setConfirming(false);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/facture`);
      const json = (await res.json().catch(() => null)) as Preview | null;
      if (!res.ok) {
        setPreview(null);
        setError(json?.error || "La facture n’est pas prête.");
        return;
      }
      setPreview(json);
      setEmail(json?.email?.pret !== false);
      setWhatsapp(json?.whatsapp?.pret !== false);
      setLink("");
    } catch {
      setError("La facture n’est pas prête.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/facture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmer: true,
          email,
          whatsapp,
          ...(link.trim() ? { lien_stripe: link.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as Preview | null;
      if (!res.ok || !json?.envoye) {
        setError(json?.error || json?.message || "La facture n’a pas été envoyée.");
        return;
      }
      setDone(json.message || "Facture envoyée.");
      setConfirming(false);
      setPreview(null);
    } catch {
      setError("La facture n’a pas été envoyée.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void load()}
        className="admin-tap rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white"
      >
        Envoyer la facture et demander le paiement
      </button>
      {done ? <p className="text-sm text-[var(--admin-navy)]">{done}</p> : null}
      {open ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4">
          {loading ? <p className="text-sm text-muted">Préparation de l’aperçu…</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--admin-red)]">
              {error}
            </p>
          ) : null}
          {preview?.apercu ? (
            <>
              <p className="text-sm text-[var(--admin-navy)]">
                Reste à payer {preview.reste_label}
                {preview.acomptes_label ? ` · acomptes ${preview.acomptes_label}` : ""} · échéance {preview.echeance}
                {preview.rib === "manquant" ? " · RIB manquant" : " · RIB inclus"}
                {preview.lien_stripe ? " · lien de paiement inclus" : ""}
              </p>
              {preview.envoi_recent ? (
                <p className="text-sm text-[var(--admin-navy)]">Un envoi vient de partir.</p>
              ) : null}
              {(preview.manques || []).length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  {(preview.manques || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
                <input
                  type="checkbox"
                  checked={email}
                  disabled={preview.email?.pret === false}
                  onChange={(event) => setEmail(event.target.checked)}
                />
                E-mail{preview.email?.raison ? ` — ${preview.email.raison}` : ""}
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
                <input
                  type="checkbox"
                  checked={whatsapp}
                  disabled={preview.whatsapp?.pret === false}
                  onChange={(event) => setWhatsapp(event.target.checked)}
                />
                WhatsApp{preview.whatsapp?.raison ? ` — ${preview.whatsapp.raison}` : ""}
              </label>
              {preview.lien_stripe ? null : (
                <label className="block text-sm text-[var(--admin-navy)]">
                  Lien Stripe du dossier, s’il existe
                  <input
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="https://buy.stripe.com/…"
                    className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </label>
              )}
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--admin-cream,#faf9f6)] p-3 text-sm text-[var(--admin-navy)]">
                {preview.objet ? `${preview.objet}\n\n` : ""}
                {preview.apercu}
              </pre>
              {confirming ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={sending || (!email && !whatsapp)}
                    onClick={() => void send()}
                    className="admin-tap rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {sending ? "Envoi…" : "Confirmer l’envoi"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="admin-tap rounded-full border border-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
                  >
                    Revenir à l’aperçu
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!email && !whatsapp}
                  onClick={() => setConfirming(true)}
                  className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
                >
                  Envoyer
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
