"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import { journalDiffLines } from "@/lib/crm/agency-journal";
import {
  agentColor,
  agentInitials,
  groupJournalByDay,
  JOURNAL_FAMILY_LABELS,
  journalAuthor,
  journalByline,
  journalClock,
  journalDayTitle,
  journalFamilyOf,
  journalIconOf,
  journalKindLabel,
  journalKindOf,
  journalPhrase,
  journalToneOf,
  type JournalTone,
} from "@/lib/crm/agency-journal-kinds";
import { bookingTabHref } from "@/lib/crm/booking-tabs";

/** Une ligne du journal telle que l’API la renvoie : quatre chiffres au plus, jamais un numéro complet. */
export type JournalFeedItem = {
  seq: number;
  occurred_at: string;
  staff_id: string | null;
  actor: string;
  actor_label?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  summary: string;
  kind?: string | null;
  booking_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  card_last4?: string | null;
  diff?: unknown;
  /** Dossier résolu par le serveur (page Activité, fiche agent). */
  dossier?: { id: string; reference: string; title?: string | null } | null;
};

const TONE_CLASS: Record<JournalTone, { badge: string; ring: string; icon: string }> = {
  neutral: {
    badge: "bg-[var(--admin-sky)] text-[var(--admin-navy)]",
    ring: "border-[var(--border)] bg-white text-[var(--admin-navy)]",
    icon: "text-[var(--admin-navy)]",
  },
  accent: {
    badge: "bg-[var(--admin-peach)] text-[var(--admin-navy)]",
    ring: "border-[var(--admin-gold)] bg-[var(--admin-peach)] text-[var(--admin-gold-dark)]",
    icon: "text-[var(--admin-gold-dark)]",
  },
  danger: {
    badge: "bg-[#fdecec] text-[var(--admin-red)]",
    ring: "border-[var(--admin-red)] bg-[#fdecec] text-[var(--admin-red)]",
    icon: "text-[var(--admin-red)]",
  },
  warning: {
    badge: "bg-[#fff1e0] text-[#9a4b00]",
    ring: "border-[#e08a2e] bg-[#fff1e0] text-[#9a4b00]",
    icon: "text-[#9a4b00]",
  },
  success: {
    badge: "bg-[#e8f3e8] text-[#1f5e2a]",
    ring: "border-[#4f9a5c] bg-[#e8f3e8] text-[#1f5e2a]",
    icon: "text-[#1f5e2a]",
  },
};

export function JournalAvatar({ name, colorKey, size = 32 }: { name: string; colorKey?: string | null; size?: number }) {
  const color = agentColor(colorKey || name);
  return (
    <span
      aria-hidden
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display text-[0.7rem] font-bold uppercase tracking-wide"
      style={{ width: size, height: size, background: color.bg, color: color.fg }}
    >
      {agentInitials(name)}
    </span>
  );
}

export function JournalFamilyBadge({ tone, children }: { tone: JournalTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${TONE_CLASS[tone].badge}`}>
      {children}
    </span>
  );
}

function DossierLink({ item, label }: { item: JournalFeedItem; label?: string }) {
  const id = item.dossier?.id || item.booking_id || (item.entity_type === "dossier" ? item.entity_id : null);
  if (!id) return null;
  const text = label || item.dossier?.reference || "Ouvrir le dossier";
  return (
    <Link
      href={bookingTabHref(id, "historique")}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-navy)] hover:border-[var(--admin-gold)]"
      onClick={(event) => event.stopPropagation()}
    >
      <Icon name="luggage" className="h-3 w-3" />
      {text}
    </Link>
  );
}

function Detail({ item }: { item: JournalFeedItem }) {
  const lines = journalDiffLines(item.diff);
  const kind = journalKindOf(item);
  const author = journalAuthor(item);
  return (
    <div className="mt-3 grid gap-3 rounded-2xl bg-[var(--admin-sky)] p-4 text-sm text-[var(--admin-navy)] sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Avant</p>
        {lines.some((line) => line.before != null) ? (
          <ul className="mt-1 space-y-1">
            {lines
              .filter((line) => line.before != null)
              .map((line) => (
                <li key={line.key}>
                  <span className="font-semibold">{line.label}</span> : {line.before}
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted">—</p>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Après</p>
        {lines.length ? (
          <ul className="mt-1 space-y-1">
            {lines.map((line) => (
              <li key={line.key}>
                <span className="font-semibold">{line.label}</span> : {line.after}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">{journalPhrase(item)}</p>
        )}
      </div>
      <p className="text-xs text-muted sm:col-span-2">
        {journalKindLabel(kind)} · {JOURNAL_FAMILY_LABELS[journalFamilyOf(item)]} · {journalByline(author, item.occurred_at)}
        {item.dossier?.reference ? ` · dossier ${item.dossier.reference}` : ""}
      </p>
    </div>
  );
}

/**
 * Frise d’actions : un jour, puis chaque geste avec l’initiale de son auteur, l’icône de son type, la phrase,
 * et dessous « par Marie · 30/10 à 14h32 ». Un clic ouvre l’avant/après.
 */
export function JournalTimeline({
  items,
  showDossier = false,
  emptyText = "Aucune action enregistrée.",
}: {
  items: JournalFeedItem[];
  showDossier?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return <p className="px-1 py-4 text-sm text-muted">{emptyText}</p>;
  const groups = groupJournalByDay(items);
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.day}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{journalDayTitle(group.day)}</p>
          <ol className="relative ml-4 border-l-2 border-[var(--border)]">
            {group.rows.map((item) => {
              const tone = journalToneOf(item);
              const family = journalFamilyOf(item);
              const author = journalAuthor(item);
              const opened = open === item.seq;
              return (
                <li key={item.seq} className="relative pb-4 pl-8 last:pb-0">
                  <span
                    className={`absolute -left-[13px] top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${TONE_CLASS[tone].ring}`}
                  >
                    <Icon name={journalIconOf(item)} className={`h-3.5 w-3.5 ${TONE_CLASS[tone].icon}`} />
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(opened ? null : item.seq)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpen(opened ? null : item.seq);
                      }
                    }}
                    aria-expanded={opened}
                    className="w-full cursor-pointer rounded-2xl border border-transparent px-3 py-2 text-left transition hover:border-[var(--border)] hover:bg-white focus:outline-none focus-visible:border-[var(--admin-gold)]"
                  >
                    <div className="flex items-start gap-3">
                      <JournalAvatar name={author} colorKey={item.staff_id || item.actor_label || author} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <JournalFamilyBadge tone={tone}>{JOURNAL_FAMILY_LABELS[family]}</JournalFamilyBadge>
                          {showDossier ? <DossierLink item={item} /> : null}
                          <span className="ml-auto text-xs tabular-nums text-muted">{journalClock(item.occurred_at)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-[var(--admin-navy)]">{journalPhrase(item)}</p>
                        <p className="mt-0.5 text-xs text-muted">{journalByline(author, item.occurred_at)}</p>
                      </div>
                    </div>
                    {opened ? <Detail item={item} /> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
