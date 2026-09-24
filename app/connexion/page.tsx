"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";

const fieldClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "forgot" | "magic" | "sent">("login");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = searchParams.get("next") || "/mon-compte";
  const authError = searchParams.get("error") === "auth";
  const noAccount = searchParams.get("error") === "no-account";

  async function loginWithPassword(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signError) {
      setError("E-mail ou mot de passe incorrect.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: staff } = user
      ? await supabase
          .from("crm_staff")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle()
      : { data: null };
    if (staff) {
      router.push("/admin");
      router.refresh();
      return;
    }
    const safeNext =
      next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/admin")
        ? next
        : "/mon-compte";
    router.push(safeNext);
    router.refresh();
  }

  async function sendMagic(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), channel }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Envoi impossible");
      return;
    }
    setMode("sent");
  }

  async function sendReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Envoi impossible. Réessayez.");
      return;
    }
    setMode("sent");
  }

  if (mode === "sent") {
    return (
      <div className="mt-6 space-y-5">
        <div className="rounded-2xl border border-[var(--admin-gold)]/30 bg-[var(--admin-peach)] px-3.5 py-3 text-sm text-[var(--admin-navy)]">
          Si un accès existe, vous recevrez un message.
        </div>
        <button
          type="button"
          className="w-full text-center text-sm text-muted"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Retour à la connexion
        </button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={sendReset} className="mt-6 space-y-5">
        <label className="block space-y-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Adresse e-mail
          </span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@email.fr"
            className={fieldClass}
          />
        </label>
        {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
        <BusyBar active={loading} label="Envoi…" />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Envoi…" : "Envoyer le lien"}
        </button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Retour à la connexion
        </button>
      </form>
    );
  }

  if (mode === "magic") {
    return (
      <form onSubmit={sendMagic} className="mt-6 space-y-5">
        <label className="block space-y-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Adresse e-mail
          </span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@email.fr"
            className={fieldClass}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
            Recevoir le lien
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["email", "E-mail"],
                ["whatsapp", "WhatsApp"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={channel === value}
                onClick={() => setChannel(value)}
                className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                  channel === value
                    ? "bg-[var(--admin-navy)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-muted">Si un accès existe, vous recevrez un message.</p>
        {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
        <BusyBar active={loading} label="Envoi…" />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Envoi…" : "Recevoir le lien"}
        </button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Retour à la connexion
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={loginWithPassword} className="mt-6 space-y-5">
      {noAccount ? (
        <p className="text-sm text-[var(--admin-red)]">
          Aucun espace voyageur n’est associé à ce compte. Contactez l’agence
          pour recevoir une invitation.
        </p>
      ) : null}
      {authError ? (
        <p className="text-sm text-[var(--admin-red)]">
          Lien invalide ou expiré. Demandez une nouvelle invitation ou
          réinitialisez votre mot de passe.
        </p>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Adresse e-mail
        </span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@email.fr"
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Mot de passe
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
        />
      </label>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <BusyBar active={loading} label="Connexion…" />
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm font-semibold text-[var(--admin-navy)]"
        onClick={() => {
          setMode("magic");
          setError(null);
        }}
      >
        Recevoir un lien de connexion
      </button>
      <button
        type="button"
        className="w-full text-center text-sm text-muted"
        onClick={() => {
          setMode("forgot");
          setError(null);
        }}
      >
        Mot de passe oublié
      </button>
      {noAccount ? (
        <button
          type="button"
          className="w-full text-center text-sm font-semibold text-[var(--admin-navy)]"
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.replace("/connexion");
            router.refresh();
          }}
        >
          Se déconnecter
        </button>
      ) : null}
    </form>
  );
}

export default function ConnexionPage() {
  return (
    <div className="account-app admin-af min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark href="/" subtitle="Espace client" />
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-muted ring-1 ring-[var(--border)]">
            Sécurisé
          </span>
        </div>
        <div className="aura-card rounded-2xl border-t-[2px] border-t-[var(--admin-gold)] bg-white p-8 sm:p-10">
          <span className="inline-flex rounded-full border border-[var(--admin-gold)]/40 bg-[var(--admin-peach)] px-3 py-1 text-[11px] font-semibold text-[#533e1c]">
            L’agence
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            Connexion
          </h1>
          <p className="mt-2 text-sm text-muted">
            Connectez-vous avec l’e-mail de votre invitation et votre mot de
            passe, ou recevez un lien magique. Vous resterez connecté sur cet appareil.
          </p>
          <div className="mt-4 h-1 w-12 rounded-full bg-[var(--admin-gold)]" />
          <Suspense fallback={<p className="mt-8 text-sm text-muted">Chargement…</p>}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Besoin d&apos;aide ? {siteConfig.phoneDisplay} · {siteConfig.contactEmail}
        </p>
      </div>
    </div>
  );
}
