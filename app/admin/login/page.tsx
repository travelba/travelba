"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";
import { MYLER_PARTNER, MYLER_SHEET } from "@/lib/crm/myler-sheet";
import { AGENCY_GOOGLE_DOMAIN } from "@/lib/crm/agency-access";
import { loginErrorMessage } from "@/lib/crm/staff-login";

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

  useEffect(() => {
    const code = searchParams.get("error");
    const message = loginErrorMessage(code);
    if (!message) return;
    const supabase = createClient();
    void supabase.auth.signOut().then(() => {
      setError(message);
    });
  }, [searchParams]);

  async function onGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const next = searchParams.get("next");
    const target = next && next.startsWith("/admin") && !next.startsWith("/admin/login") ? next : "/admin";
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", target);
    redirectTo.searchParams.set("staff", "google");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { hd: AGENCY_GOOGLE_DOMAIN, prompt: "select_account" },
      },
    });
    if (oauthError) {
      setLoading(false);
      setError("La connexion Google n’est pas disponible pour le moment.");
    }
  }

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
      const address = email.trim();
      if (address) {
        void fetch("/api/auth/staff-failure", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: address }),
        });
      }
      setLoading(false);
      setError(english ? "Email or password is incorrect." : "E-mail ou mot de passe incorrect.");
      return;
    }

    const known = await fetch("/api/auth/known-password", { method: "POST" });
    if (known.status === 403) {
      await supabase.auth.signOut();
      setLoading(false);
      setError("Cet accès est désactivé.");
      return;
    }

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
          {english ? null : (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => void onGoogle()}
                className="admin-tap flex w-full items-center justify-center gap-2 rounded-full border border-[var(--admin-navy)] bg-white px-4 py-3.5 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-60"
              >
                <GoogleMark />
                Continuer avec Google {AGENCY_GOOGLE_DOMAIN}
              </button>
              <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                <span className="h-px flex-1 bg-[var(--border)]" aria-hidden />
                ou mot de passe
                <span className="h-px flex-1 bg-[var(--border)]" aria-hidden />
              </p>
            </>
          )}
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.5l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.5l4 3.1c1-2.8 3.6-4.8 6.7-4.8z" />
    </svg>
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
