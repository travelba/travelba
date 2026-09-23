"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icons";

type Diagnostic = {
  configured: boolean;
  topicSet: boolean;
  requestedLabels: string[];
  gmail:
    | { ok: true; labelsFound: string[]; labelsMissing: string[] }
    | { ok: false; error: string }
    | null;
  sync: { history_id: string | null; watch_expiration: string | null } | null;
  counts: Record<string, number>;
};

function Line({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        name={ok ? "verified" : "close"}
        className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-[var(--admin-navy)]" : "text-accent"}`}
      />
      <span className="min-w-0 text-[var(--admin-navy)]">{children}</span>
    </li>
  );
}

export function GmailDiagnostic() {
  const [state, setState] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-ingest/diagnostic");
      const data = (await res.json()) as Diagnostic & { error?: string };
      if (!res.ok) {
        setError(data.error || "Diagnostic impossible");
        return;
      }
      setState(data);
    } catch {
      setError("Réseau indisponible, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const gmailOk = state?.gmail?.ok === true;
  const labelsMissing =
    state?.gmail?.ok === true ? state.gmail.labelsMissing : [];

  return (
    <div className="mb-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="mail" className="h-5 w-5 text-[var(--admin-navy)]" />
          <p className="font-display text-sm font-semibold text-[var(--admin-navy)]">
            Connexion Gmail
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          <Icon name="sync_alt" className="h-4 w-4" />
          {loading ? "Test en cours…" : "Tester la connexion"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {state ? (
        <ul className="mt-3 space-y-1">
          <Line ok={state.configured}>
            Secrets Gmail {state.configured ? "présents" : "manquants (GOOGLE_SA_JSON / GMAIL_IMPERSONATE)"}
          </Line>
          <Line ok={state.topicSet}>
            Topic Pub/Sub {state.topicSet ? "configuré" : "manquant (GMAIL_PUBSUB_TOPIC)"}
          </Line>
          {state.gmail ? (
            gmailOk ? (
              <Line ok={labelsMissing.length === 0}>
                Authentification Gmail OK ·{" "}
                {labelsMissing.length === 0
                  ? `libellés trouvés : ${state.requestedLabels.join(", ")}`
                  : `libellés introuvables : ${labelsMissing.join(", ")}`}
              </Line>
            ) : (
              <Line ok={false}>
                Auth Gmail échouée : {state.gmail.ok === false ? state.gmail.error : ""}
              </Line>
            )
          ) : null}
          <Line ok={Boolean(state.sync?.history_id)}>
            {state.sync?.history_id
              ? `Suivi actif (historyId ${state.sync.history_id}${
                  state.sync.watch_expiration
                    ? `, watch jusqu'au ${new Date(state.sync.watch_expiration).toLocaleString("fr-FR")}`
                    : ", watch non posé"
                })`
              : "Suivi pas encore initialisé — lancez le cron gmail-watch-renew"}
          </Line>
          <li className="pt-1 text-xs text-muted">
            En attente : {state.counts.received ?? 0} · à rattacher :{" "}
            {(state.counts.parsed ?? 0) + (state.counts.matched ?? 0)} · erreurs :{" "}
            {state.counts.error ?? 0}
          </li>
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Vérifie l’accès au compte Gmail (auth, libellés, topic) sans effet de bord.
        </p>
      )}
    </div>
  );
}
