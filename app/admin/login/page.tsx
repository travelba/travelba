"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";
import { MYLER_PARTNER, MYLER_SHEET } from "@/lib/crm/myler-sheet";

function partnerEntry(searchParams: { get(name: string): string | null }) {
  const next = searchParams.get("next") || "";
  return searchParams.get("espace") === "myler" || next.startsWith("/admin/little-emperors");
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const english = partnerEntry(searchParams);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signError) {
      setLoading(false);
      setError(english ? "Email or password is incorrect." : "E-mail ou mot de passe incorrect.");
      return;
    }

    await fetch("/api/auth/known-password", { method: "POST" });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: staff } = user
      ? await supabase
          .from("crm_staff")
          .select("id, role")
          .eq("auth_user_id", user.id)
          .maybeSingle()
      : { data: null };

    if (!staff) {
      await supabase.auth.signOut();
      setLoading(false);
      setError(
        english
          ? "This account cannot open Little Emperors."
          : "Accès réservé à l’équipe. L’espace client est sur /connexion."
      );
      return;
    }

    setLoading(false);
    const next = searchParams.get("next");
    const destination =
      staff.role === "partner"
        ? "/admin/little-emperors"
        : next && next.startsWith("/admin") && !next.startsWith("/admin/login")
          ? next
          : "/admin";
    router.push(destination);
    router.refresh();
  }

  async function onForgot(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("Envoi impossible. Réessayez.");
      return;
    }
    setMode("sent");
  }

  return (
    <>
      <div className="mb-6">
        <BrandMark href="/" subtitle={english ? "MyLER" : undefined} />
      </div>
      <div className="admin-af-card rounded-[1.5rem] p-8 sm:p-10">
        <p className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-gold)]">
          {english ? "Sign in" : "Connexion"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--admin-navy)]">
          {english ? "Travelba sign-in" : "Espace agence"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {english
            ? `MyLER partners sign in here with their Travelba account. You then open only Little Emperors. ${MYLER_PARTNER.sso}`
            : `Équipe Travel Business Agency. ${MYLER_SHEET.sso}`}
        </p>
        {mode === "sent" ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-[var(--admin-navy)]">
              Si cette adresse est celle d’un membre de l’équipe, un lien vient d’être envoyé. Il ne crée pas de compte.
            </p>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--admin-navy)] underline"
              onClick={() => setMode("login")}
            >
              Retour à la connexion
            </button>
          </div>
        ) : mode === "forgot" ? (
          <form onSubmit={onForgot} className="mt-6 space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">E-mail</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="admin-af-input w-full"
              />
            </label>
            {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
            <BusyBar active={loading} label="Envoi…" />
            <button
              type="submit"
              disabled={loading}
              className="admin-af-btn w-full rounded-full px-4 py-3.5 text-sm disabled:opacity-60"
            >
              {loading ? "Envoi…" : "Envoyer le lien"}
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--admin-navy)] underline"
              onClick={() => setMode("login")}
            >
              Retour à la connexion
            </button>
          </form>
        ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {english ? "Email" : "E-mail"}
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="admin-af-input w-full"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {english ? "Password" : "Mot de passe"}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-af-input w-full"
            />
          </label>
          {english || mode !== "login" ? null : (
            <button
              type="button"
              className="text-sm font-semibold text-[var(--admin-navy)] underline"
              onClick={() => {
                setError(null);
                setMode("forgot");
              }}
            >
              Mot de passe oublié
            </button>
          )}
          {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
          <BusyBar active={loading} label={english ? "Signing in…" : "Connexion…"} />
          <button
            type="submit"
            disabled={loading}
            className="admin-af-btn w-full rounded-full px-4 py-3.5 text-sm disabled:opacity-60"
          >
            {loading ? (english ? "Signing in…" : "Connexion…") : english ? "Sign in" : "Se connecter"}
          </button>
        </form>
        )}
      </div>
    </>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center">
      <Suspense fallback={<p className="text-sm text-muted">…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
