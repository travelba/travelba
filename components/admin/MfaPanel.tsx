"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BusyBar } from "@/components/crm/BusyBar";

type Factor = { id: string; status: string; factor_type: string };

/** Le secret et le QR restent dans le navigateur. Rien n’est envoyé au journal. */
export function MfaPanel() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError("La double authentification n’a pas pu être lue.");
      return;
    }
    setFactors((data?.totp || []) as Factor[]);
    setReady(true);
  }

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (listError) {
        setError("La double authentification n’a pas pu être lue.");
        return;
      }
      setFactors((data?.totp || []) as Factor[]);
      setReady(true);
    });
  }, []);

  async function enroll() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (enrollError || !data) {
      setError("L’enrôlement n’a pas pu commencer.");
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      setError("Le code n’a pas pu être vérifié.");
      return;
    }
    const verified = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setBusy(false);
    if (verified.error) {
      setError("Code incorrect.");
      return;
    }
    setQr(null);
    setFactorId(null);
    setCode("");
    await fetch("/api/admin/securite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "enroll" }),
    });
    await refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: dropError } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (dropError) {
      setError("Le facteur n’a pas pu être retiré.");
      return;
    }
    await fetch("/api/admin/securite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unenroll" }),
    });
    await refresh();
  }

  const verified = factors.filter((factor) => factor.status === "verified");

  return (
    <section className="admin-af-card mt-6 max-w-xl space-y-4 rounded-3xl p-5">
      <BusyBar active={busy} />
      <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Double authentification</h2>
      <p className="text-sm text-muted">
        Facultative. Une fois activée, l’espace agence demande le code de l’application à chaque connexion.
      </p>
      {!ready ? <p className="text-sm text-muted">Lecture…</p> : null}
      {verified.map((factor) => (
        <div key={factor.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-[var(--admin-navy)]">Activée</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove(factor.id)}
            className="admin-tap text-sm font-semibold underline disabled:opacity-50"
          >
            Retirer
          </button>
        </div>
      ))}
      {!verified.length && !qr ? (
        <button type="button" disabled={busy} onClick={() => void enroll()} className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm">
          Activer
        </button>
      ) : null}
      {qr ? (
        <form onSubmit={confirm} className="space-y-3">
          <div
            role="img"
            aria-label="QR code de la double authentification"
            className="h-40 w-40 rounded-xl bg-white bg-contain bg-center bg-no-repeat"
            style={{
              backgroundImage: `url("${qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`}")`,
            }}
          />
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Code à six chiffres
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="admin-af-input text-sm"
            />
          </label>
          <button type="submit" disabled={busy || code.trim().length < 6} className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm">
            Confirmer
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm font-semibold text-[var(--admin-navy)]">{error}</p> : null}
    </section>
  );
}
