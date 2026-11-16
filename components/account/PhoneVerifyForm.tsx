"use client";

import { FormEvent, useState } from "react";

export function PhoneVerifyForm({
  initialPhone = "",
  onVerified,
}: {
  initialPhone?: string;
  onVerified?: () => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/inscription/telephone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "Le code n’a pas pu être envoyé.");
      return;
    }
    setSent(true);
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/inscription/telephone/verifier", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "Ce code n’est pas le bon.");
      return;
    }
    onVerified?.();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={send} className="space-y-3">
        <label className="block text-sm text-[var(--admin-navy)]">
          Téléphone mobile
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSent(false);
            }}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+33 6 12 34 56 78"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)]"
          />
        </label>
        <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-[var(--admin-navy)] text-sm font-semibold text-white disabled:opacity-60">
          {sent ? "Renvoyer le code" : "Recevoir le code"}
        </button>
      </form>
      {sent ? (
        <form onSubmit={check} className="space-y-3">
          <label className="block text-sm text-[var(--admin-navy)]">
            Code reçu par SMS
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 tracking-[0.3em] text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)]"
            />
          </label>
          <button type="submit" disabled={loading || code.length !== 6} className="h-11 w-full rounded-full bg-[#C5A880] text-sm font-semibold text-[#0B192C] disabled:opacity-60">
            Confirmer le numéro
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-[var(--admin-red,#9b3a3a)]">{error}</p> : null}
    </div>
  );
}
