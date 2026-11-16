"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/crm/ui";
import { PhoneVerifyForm } from "@/components/account/PhoneVerifyForm";
import { SignupCard } from "@/components/account/SignupCard";

type Step = "identite" | "telephone" | "carte" | "conditions" | "ouvert";

type Status = {
  step: Step;
  firstName: string;
  lastName: string;
  phone: string;
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)]";

export function InscriptionFlow({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!signedIn);

  const reload = useCallback(async () => {
    const response = await fetch("/api/auth/inscription");
    if (response.status === 401) {
      setStatus(null);
      setReady(true);
      return;
    }
    const json = (await response.json().catch(() => null)) as Status | null;
    if (!response.ok || !json?.step) {
      setError("L’inscription n’a pas pu être relue.");
      setReady(true);
      return;
    }
    if (json.step === "ouvert") {
      router.push("/mon-compte/hotels");
      router.refresh();
      return;
    }
    setStatus(json);
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/auth/inscription");
      if (cancelled) return;
      if (response.status === 401) {
        setStatus(null);
        setReady(true);
        return;
      }
      const json = (await response.json().catch(() => null)) as Status | null;
      if (cancelled) return;
      if (!response.ok || !json?.step) {
        setError("L’inscription n’a pas pu être relue.");
        setReady(true);
        return;
      }
      if (json.step === "ouvert") {
        router.push("/mon-compte/hotels");
        router.refresh();
        return;
      }
      setStatus(json);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);

  if (signedIn && !ready) {
    return (
      <Shell>
        <p className="text-sm text-[#3d4a5c]">Chargement…</p>
      </Shell>
    );
  }

  if (!signedIn || !status) {
    return (
      <Door
        error={error}
        loading={loading}
        setError={setError}
        setLoading={setLoading}
        onSignedIn={() => {
          router.refresh();
          void reload();
        }}
      />
    );
  }

  return (
    <Shell>
      {status.step === "identite" ? (
        <Identity firstName={status.firstName} lastName={status.lastName} onDone={() => void reload()} />
      ) : null}
      {status.step === "telephone" ? <PhoneVerifyForm initialPhone={status.phone} onVerified={() => void reload()} /> : null}
      {status.step === "carte" ? <SignupCard onSaved={() => void reload()} /> : null}
      {status.step === "conditions" ? <Terms onDone={() => void reload()} /> : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-app admin-af min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-5 py-10">
        <BrandMark href="/" subtitle="Espace client" />
        <h1 className="mt-8 font-display text-3xl font-bold text-[var(--admin-navy)]">Réserver un hôtel</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Votre espace se limite à vos hôtels. L’agence réserve en son nom, vous réglez le séjour.
        </p>
        <div className="mt-8 rounded-3xl border border-[#e5e3dc] bg-white p-5 shadow-sm">{children}</div>
      </main>
    </div>
  );
}

function Door({
  error,
  loading,
  setError,
  setLoading,
  onSignedIn,
}: {
  error: string | null;
  loading: boolean;
  setError: (value: string | null) => void;
  setLoading: (value: boolean) => void;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);

  async function google() {
    setLoading(true);
    setError(null);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("compte", "google");
    redirectTo.searchParams.set("next", "/inscription");
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString(), queryParams: { prompt: "select_account" } },
    });
    if (oauthError) {
      setLoading(false);
      setError("La connexion Google n’est pas disponible pour le moment.");
    }
  }

  async function emailSignup(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/inscription/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setLoading(false);
      setError(json.error || "L’inscription n’a pas abouti.");
      return;
    }
    const signed = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signed.error) {
      setError("Le compte est créé. Connectez-vous pour continuer.");
      return;
    }
    onSignedIn();
  }

  return (
    <Shell>
      <div className="space-y-4">
        <button type="button" disabled={loading} onClick={() => void google()} className="h-12 w-full rounded-full bg-[#0B192C] text-sm font-semibold text-white disabled:opacity-60">
          Continuer avec Google
        </button>
        <button type="button" className="w-full text-center text-sm font-semibold text-[#0B192C]" onClick={() => setEmailOpen((open) => !open)}>
          Continuer avec une adresse e-mail
        </button>
        {emailOpen ? (
          <form onSubmit={emailSignup} className="space-y-3">
            <label className="block text-sm text-[#0B192C]">
              E-mail
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={fieldClass} />
            </label>
            <label className="block text-sm text-[#0B192C]">
              Mot de passe
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className={fieldClass} />
            </label>
            <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-[#C5A880] text-sm font-semibold text-[#0B192C] disabled:opacity-60">
              Créer l’accès
            </button>
          </form>
        ) : null}
        {error ? <p className="text-sm text-[#9b3a3a]">{error}</p> : null}
        <p className="text-center text-sm text-[#5c6b7a]">
          Déjà un accès ? <Link className="font-semibold text-[#0B192C]" href="/connexion">Se connecter</Link>
        </p>
      </div>
    </Shell>
  );
}

function Identity({ firstName, lastName, onDone }: { firstName: string; lastName: string; onDone: () => void }) {
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/inscription/identite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: first, lastName: last }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "Le nom n’a pas été enregistré.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-sm text-[#3d4a5c]">Ces noms figurent sur la réservation.</p>
      <label className="block text-sm text-[#0B192C]">
        Prénom
        <input value={first} onChange={(event) => setFirst(event.target.value)} className={fieldClass} />
      </label>
      <label className="block text-sm text-[#0B192C]">
        Nom
        <input value={last} onChange={(event) => setLast(event.target.value)} className={fieldClass} />
      </label>
      {error ? <p className="text-sm text-[#9b3a3a]">{error}</p> : null}
      <button type="submit" disabled={loading} className="h-11 w-full rounded-full bg-[#0B192C] text-sm font-semibold text-white disabled:opacity-60">
        Continuer
      </button>
    </form>
  );
}

function Terms({ onDone }: { onDone: () => void }) {
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/inscription/ouvrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adult, terms }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "L’ouverture n’a pas abouti.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={open} className="space-y-4 text-sm leading-relaxed text-[#0B192C]">
      <p>Vous avez 18 ans ou plus. L’agence réserve l’hôtel en son nom. Votre carte est une garantie : aucun montant n’est pris maintenant. Le séjour est encaissé lorsque l’hôtel est confirmé. L’annulation suit le tarif choisi.</p>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} className="mt-1" />
        J’ai 18 ans ou plus.
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1" />
        J’accepte ces conditions.
      </label>
      {error ? <p className="text-[#9b3a3a]">{error}</p> : null}
      <button type="submit" disabled={loading || !adult || !terms} className="h-11 w-full rounded-full bg-[#C5A880] text-sm font-semibold text-[#0B192C] disabled:opacity-60">
        Ouvrir les hôtels
      </button>
    </form>
  );
}
