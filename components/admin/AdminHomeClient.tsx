"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  WIZARD_STEPS,
  wizardStepFromGuide,
  type AgencyMtripGuide,
} from "@/lib/mtrip/guide-types";

type Props = {
  guides: AgencyMtripGuide[];
};

export function AdminHomeClient({ guides }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startVoyage() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/mtrip/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nouveau voyage", passengers: [] }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error || "Création impossible");
      return;
    }
    router.push(`/admin/mtrip/${data.guide.id}`);
  }

  async function deleteVoyage(g: AgencyMtripGuide) {
    const label = g.title || "ce voyage";
    const ok = window.confirm(
      `Supprimer « ${label} » du dashboard${
        g.mtrip_identifier ? " et de mTrip" : ""
      } ?`
    );
    if (!ok) return;
    setDeletingId(g.id);
    setError(null);
    const res = await fetch(`/api/admin/mtrip/guides/${g.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setError(data.error || "Suppression impossible");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="admin-af-hero-band relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 20%, rgba(232,25,50,0.45), transparent 40%), radial-gradient(circle at 10% 80%, rgba(255,255,255,0.12), transparent 35%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
              Travel Business Agency
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Voyages
            </h1>
          </div>
          <button
            type="button"
            onClick={startVoyage}
            disabled={creating}
            className="admin-af-btn relative rounded-full px-6 py-3.5 text-sm shadow-lg shadow-black/20 disabled:opacity-50"
          >
            {creating ? "Création…" : "Nouveau voyage"}
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
          {error}
        </p>
      )}

      {!guides.length ? (
        <button
          type="button"
          onClick={startVoyage}
          className="admin-af-card flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-dashed px-6 py-20 text-center transition hover:border-accent/40"
        >
          <span className="font-display text-2xl font-bold text-[var(--admin-navy)]">
            Commencer un voyage
          </span>
          <span className="text-sm text-muted">
            Déposez les passeports à l’écran suivant
          </span>
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {guides.map((g) => {
            const lead =
              (g.passengers || []).find((p) => p.role === "lead_traveler") ||
              (g.passengers || [])[0];
            const wizard = wizardStepFromGuide(g);
            const wi = WIZARD_STEPS.findIndex((s) => s.id === wizard);
            const total = (g.quote_lines || []).reduce(
              (s, l) => s + (typeof l.amount === "number" ? l.amount : 0),
              0
            );
            const initials = lead
              ? `${lead.first_name?.[0] || ""}${lead.last_name?.[0] || ""}`.toUpperCase()
              : "?";
            const busy = deletingId === g.id;

            return (
              <div
                key={g.id}
                className="admin-af-card group relative flex flex-col rounded-3xl p-5 transition hover:-translate-y-0.5 hover:border-accent/35"
              >
                <button
                  type="button"
                  onClick={() => void deleteVoyage(g)}
                  disabled={busy}
                  title="Supprimer le voyage"
                  className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-xs text-muted opacity-70 transition hover:bg-accent/10 hover:text-accent group-hover:opacity-100 disabled:opacity-40"
                >
                  {busy ? "…" : "Supprimer"}
                </button>

                <Link
                  href={`/admin/mtrip/${g.id}`}
                  className="flex flex-1 flex-col"
                >
                  <div className="flex items-start gap-3 pr-16">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--admin-navy)] font-display text-lg font-bold text-white">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold tracking-tight text-[var(--admin-navy)] group-hover:text-accent">
                        {g.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {lead
                          ? `${lead.first_name} ${lead.last_name}`
                          : "Sans voyageur"}
                        {(g.passengers || []).length > 1
                          ? ` +${(g.passengers || []).length - 1}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-1">
                    {WIZARD_STEPS.map((s, i) => (
                      <div
                        key={s.id}
                        className={`h-1.5 flex-1 rounded-full ${
                          i <= wi ? "bg-accent" : "bg-[var(--admin-sky)]"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{WIZARD_STEPS[wi]?.label || "—"}</span>
                    <span>
                      {g.start_date && g.end_date
                        ? `${g.start_date.slice(5)} → ${g.end_date.slice(5)}`
                        : "Dates —"}
                    </span>
                  </div>

                  {total > 0 && (
                    <p className="mt-4 font-display text-lg font-bold tracking-tight text-[var(--admin-navy)]">
                      {total.toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </p>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
