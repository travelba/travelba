"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConciergeProposalDesk } from "@/components/admin/ConciergeProposalDesk";
import { WhatsappHoldButton, type HandoffResult } from "@/components/admin/WhatsappHoldButton";
import {
  conversationBadge,
  deliveryLabel,
  filterThreads,
  maskSensitiveCopy,
  messageSpeaker,
  messagesNewestFirst,
  parisStamp,
  QUICK_REPLIES,
  speakerLabel,
  type InboxDossier,
  type InboxFilter,
  type InboxMessage,
  type InboxThread,
} from "@/lib/crm/whatsapp-inbox";
import { isHandoffNote } from "@/lib/crm/whatsapp-takeover";

export type InboxProposal = { id: string; draft: string };
export type InboxTemplate = { key: string; label: string };

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "non-lus", label: "Non lus" },
  { id: "escalade", label: "Demandes" },
  { id: "robot", label: "Le Concierge" },
  { id: "agence", label: "Agence" },
  { id: "prospects", label: "Prospects" },
];

export function WhatsappInbox({
  threads,
  messages,
  activeKey,
  proposals,
  templates,
  windowOpen,
  previewBlocked,
  embedded = false,
  initialFilter = "tous",
  dossier = null,
  offline = false,
  basePath = "/admin/whatsapp",
  onSelect,
}: {
  threads: InboxThread[];
  messages: InboxMessage[];
  activeKey: string | null;
  proposals: InboxProposal[];
  templates: InboxTemplate[];
  windowOpen: boolean;
  previewBlocked: boolean;
  embedded?: boolean;
  initialFilter?: InboxFilter;
  dossier?: InboxDossier | null;
  /** Aperçu : les gestes restent à l’écran, aucun appel. */
  offline?: boolean;
  basePath?: string;
  onSelect?: (key: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [seenFilter, setSeenFilter] = useState(initialFilter);
  if (seenFilter !== initialFilter) {
    setSeenFilter(initialFilter);
    setFilter(initialFilter);
  }
  const [body, setBody] = useState("");
  const [template, setTemplate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [listOnPhone, setListOnPhone] = useState(!activeKey);
  const [seenKey, setSeenKey] = useState(activeKey);
  if (seenKey !== activeKey) {
    setSeenKey(activeKey);
    setListOnPhone(false);
  }
  const [marks, setMarks] = useState<Record<string, "good" | "bad" | null>>({});
  const visible = useMemo(() => filterThreads(threads, { query, filter }), [threads, query, filter]);
  const active = threads.find((thread) => thread.key === activeKey) || null;
  const serverHeld = Boolean(active && (active.held ?? active.status === "agency"));
  const [localHold, setLocalHold] = useState<{ key: string; held: boolean; seenServer: boolean; notes: InboxMessage[] } | null>(null);
  const liveHold = localHold && localHold.key === (active?.key || "") && localHold.seenServer === serverHeld ? localHold : null;
  const held = liveHold ? liveHold.held : serverHeld;
  const notes = liveHold?.notes || [];
  const ordered = messagesNewestFirst([
    ...messages,
    ...notes.filter((row) => !messages.some((message) => message.templateKey === "systeme" && message.body === row.body)),
  ]);

  useEffect(() => {
    if (embedded || offline) return;
    const timer = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [embedded, offline, router]);

  useEffect(() => {
    if (embedded || offline || typeof Notification === "undefined") return;
    const unread = threads.reduce((sum, thread) => sum + thread.unread, 0);
    const previous = Number(sessionStorage.getItem("tba-wa-unread") || "0");
    if (unread > previous && document.hidden && Notification.permission === "granted") {
      new Notification("WhatsApp", { body: "Un nouveau message est arrivé." });
    }
    sessionStorage.setItem("tba-wa-unread", String(unread));
  }, [embedded, offline, threads]);

  async function post(payload: Record<string, unknown>, options?: { keepDraft?: boolean }) {
    if (offline) {
      if (!options?.keepDraft) setBody("");
      setNote("Aperçu : rien n’est parti.");
      return true;
    }
    setBusy(true);
    setNote("");
    const response = await fetch("/api/admin/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setNote(data?.error || "L’envoi n’a pas abouti.");
      return false;
    }
    if (!options?.keepDraft) setBody("");
    router.refresh();
    return true;
  }

  async function send() {
    if (!active?.phone) return;
    const file = (document.getElementById("wa-file") as HTMLInputElement | null)?.files?.[0];
    let mediaName: string | null = null;
    let mediaType: string | null = null;
    let mediaBase64: string | null = null;
    if (file && !offline) {
      mediaName = file.name;
      mediaType = file.type;
      mediaBase64 = await fileToBase64(file);
    }
    const ok = await post({
      action: "reply",
      phone: active.phone,
      customerId: active.customerId,
      bookingId: active.bookingId,
      body,
      template: windowOpen ? "" : template,
      mediaName,
      mediaType,
      mediaBase64,
    });
    if (ok) {
      const input = document.getElementById("wa-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setNote(previewBlocked || offline ? "Aperçu : rien n’est parti." : "Message envoyé. Le Concierge est en pause.");
    }
  }

  function chooseFilter(id: InboxFilter) {
    setFilter(id);
    if (offline || onSelect) return;
    const params = new URLSearchParams(window.location.search);
    if (id === "tous") params.delete("filtre");
    else params.set("filtre", id);
    const queryString = params.toString();
    router.replace(queryString ? `${basePath}?${queryString}` : basePath);
  }

  function openThread(key: string) {
    setListOnPhone(false);
    onSelect?.(key);
  }

  const phoneList = !active || listOnPhone;

  return (
    <div className={embedded ? "" : "grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_240px]"}>
      {embedded ? null : (
        <aside className={`rounded-3xl border border-[var(--border)] bg-white ${phoneList ? "" : "max-lg:hidden"}`}>
          <div className="space-y-3 border-b border-[var(--border)] p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, téléphone, dossier"
              className="w-full rounded-full border border-[var(--border)] px-3 py-2 text-sm"
              aria-label="Rechercher une conversation"
            />
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((item) => {
                const count = item.id === "tous" ? threads.length : filterThreads(threads, { filter: item.id }).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseFilter(item.id)}
                    className={`rounded-full px-2.5 py-1 text-xs ${filter === item.id ? "bg-[#0B192C] text-white" : "bg-[#f4efe6] text-[#0B192C]"}`}
                  >
                    {item.label}
                    {count ? ` ${count}` : ""}
                  </button>
                );
              })}
            </div>
            <button type="button" className="text-xs font-semibold text-[#0B192C] underline" onClick={() => void askWhatsappNotifications()}>
              Alertes du navigateur
            </button>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {visible.map((thread) => {
              const label = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[#0B192C]">
                      {thread.customerName || thread.phone || "Numéro inconnu"}
                    </span>
                    {thread.unread > 0 ? (
                      <span className="rounded-full bg-[#C5A880] px-1.5 text-[10px] text-[#0B192C]">{thread.unread}</span>
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--color-ink-soft)]">{maskSensitiveCopy(thread.lastBody)}</span>
                  <span className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-[#8a7350]">
                    <span>
                      {conversationBadge(thread.status, Boolean(thread.held ?? thread.status === "agency"))}
                      {thread.prospect ? " · Prospect" : ""}
                    </span>
                    <span>{thread.bookingReference || parisStamp(thread.lastAt)}</span>
                  </span>
                </>
              );
              const className = `block w-full border-b border-[var(--border)] px-3 py-3 text-left ${thread.key === activeKey ? "bg-[#f7f1e6]" : ""}`;
              return (
                <li key={thread.key}>
                  {onSelect ? (
                    <button type="button" className={className} onClick={() => openThread(thread.key)}>
                      {label}
                    </button>
                  ) : (
                    <Link href={`${basePath}?fil=${encodeURIComponent(thread.key)}${filter === "tous" ? "" : `&filtre=${filter}`}`} className={className}>
                      {label}
                    </Link>
                  )}
                </li>
              );
            })}
            {visible.length ? null : <li className="p-4 text-sm text-[var(--color-ink-soft)]">Aucune conversation.</li>}
          </ul>
        </aside>
      )}

      <section className={`flex min-h-[70vh] flex-col rounded-3xl border border-[var(--border)] bg-[#efe7da] ${phoneList && !embedded ? "max-lg:hidden" : ""}`}>
        {active ? (
          <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-3xl bg-[#0B192C] px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="text-sm font-medium">{active.customerName || active.phone}</p>
              <p className="text-xs text-[#C5A880]">
                {conversationBadge(active.status, held)}
                {active.bookingReference ? ` · ${active.bookingReference}` : ""}
                {active.customerId ? "" : " · Prospect"}
                {windowOpen ? " · 24 h ouvertes" : " · hors 24 h"}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2 text-xs">
              {activeKey && !embedded ? (
                <button type="button" className="rounded-full bg-white/10 px-3 py-1 lg:hidden" onClick={() => setListOnPhone(true)}>
                  Conversations
                </button>
              ) : null}
              {active.customerId ? (
                <Link className="rounded-full bg-white/10 px-3 py-1" href={`/admin/clients/${active.customerId}`}>
                  Fiche
                </Link>
              ) : null}
              {active.bookingId ? (
                <Link className="rounded-full bg-white/10 px-3 py-1" href={`/admin/reservations/${active.bookingId}?onglet=client`}>
                  Séjour
                </Link>
              ) : null}
              {active.phone ? (
                <WhatsappHoldButton
                  phone={active.phone}
                  customerId={active.customerId}
                  held={held}
                  offline={offline}
                  className="rounded-full bg-[#C5A880] px-3 py-1 text-[#0B192C] disabled:opacity-60"
                  onResult={(result) => applyHandoff(active, result, serverHeld, setLocalHold, () => (offline ? undefined : router.refresh()))}
                />
              ) : null}
            </div>
          </header>
        ) : (
          <p className="p-6 text-sm text-[var(--color-ink-soft)]">Choisissez une conversation.</p>
        )}

        {active && dossier ? (
          <details className="border-b border-[#e4d8c4] bg-[#f7f1e6] px-4 py-2 text-sm lg:hidden">
            <summary className="cursor-pointer font-semibold text-[#0B192C]">Dossier</summary>
            <DossierFacts dossier={dossier} />
          </details>
        ) : null}

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {ordered.map((message) => {
            if (isHandoffNote(message)) {
              return (
                <p key={message.id} role="status" className="text-center text-xs font-medium text-[#8a7350]">
                  {message.body}
                </p>
              );
            }
            const speaker = messageSpeaker(message);
            const mine = speaker !== "client";
            const mark = marks[message.id] === undefined ? message.conciergeMark : marks[message.id];
            return (
              <article key={message.id} id={`m-${message.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    message.requestId
                      ? "border border-[#C5A880] bg-white"
                      : speaker === "client"
                        ? "bg-white text-[#0B192C]"
                        : speaker === "agency"
                          ? "bg-[#0B192C] text-white"
                          : "bg-[#f7f1e6] text-[#0B192C]"
                  }`}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-[#C5A880]">{speakerLabel(speaker, message.authorName)}</p>
                  <p className="whitespace-pre-wrap">{maskSensitiveCopy(message.body)}</p>
                  {message.mediaPath ? (
                    <a className="mt-2 block text-xs underline" href={`/api/files?path=${encodeURIComponent(message.mediaPath)}`}>
                      Pièce jointe
                    </a>
                  ) : null}
                  {message.tools.length ? (
                    <p className="mt-2 text-[10px] uppercase tracking-wide opacity-70">Outils : {message.tools.join(", ")}</p>
                  ) : null}
                  <p className={`mt-1 text-[10px] ${mine && speaker === "agency" ? "text-white/70" : "text-[var(--color-ink-soft)]"}`}>
                    {parisStamp(message.createdAt)}
                    {deliveryLabel(message.status) ? ` · ${deliveryLabel(message.status)}` : ""}
                    {message.requestId ? " · Demande ouverte" : ""}
                  </p>
                  {message.requestId ? (
                    <button
                      type="button"
                      className="mt-2 rounded-full bg-[#0B192C] px-2 py-1 text-[10px] text-white"
                      onClick={() => void post({ action: "done", requestId: message.requestId })}
                    >
                      Marquer traitée
                    </button>
                  ) : null}
                  {speaker === "robot" ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className={`text-[10px] underline ${mark === "good" ? "font-bold text-[#0B192C]" : ""}`}
                        aria-pressed={mark === "good"}
                        disabled={busy}
                        onClick={() => {
                          const next = mark === "good" ? null : "good";
                          void post(
                            { action: "mark", messageId: message.id, mark: next || "clear" },
                            { keepDraft: true }
                          ).then((ok) => {
                            if (ok) setMarks((current) => ({ ...current, [message.id]: next }));
                          });
                        }}
                      >
                        Bien
                      </button>
                      <button
                        type="button"
                        className={`text-[10px] underline ${mark === "bad" ? "font-bold text-[#0B192C]" : ""}`}
                        aria-pressed={mark === "bad"}
                        disabled={busy}
                        onClick={() => {
                          const next = mark === "bad" ? null : "bad";
                          void post(
                            { action: "mark", messageId: message.id, mark: next || "clear" },
                            { keepDraft: true }
                          ).then((ok) => {
                            if (ok) setMarks((current) => ({ ...current, [message.id]: next }));
                          });
                        }}
                      >
                        À revoir
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {active?.prospect && active.phone ? (
          <form
            className="mx-3 mb-2 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void post({ action: "create-client", phone: active.phone, firstName, lastName });
            }}
          >
            <p className="w-full text-xs text-[var(--color-ink-soft)]">Prospect. La fiche est créée sans invitation.</p>
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Prénom" aria-label="Prénom" className="rounded-full border px-3 py-1.5 text-sm" required />
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Nom" aria-label="Nom" className="rounded-full border px-3 py-1.5 text-sm" required />
            <button type="submit" className="admin-af-btn rounded-full px-3 py-1.5 text-sm" disabled={busy}>
              Créer la fiche
            </button>
          </form>
        ) : null}

        {proposals.map((proposal) => (
          <div key={proposal.id} className="mx-3 mb-2 rounded-2xl bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-[#8a7350]">Proposition du Concierge</p>
            <ConciergeProposalDesk id={proposal.id} draft={proposal.draft} />
          </div>
        ))}

        {active?.phone ? (
          <form
            className="m-3 rounded-2xl bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
              {windowOpen
                ? "Fenêtre de 24 h ouverte : texte libre."
                : "Au-delà de 24 h : choisissez un modèle déjà approuvé. Le texte libre ne part pas."}
              {previewBlocked || offline ? " Aperçu : l’envoi est coupé." : ""}
            </p>
            {windowOpen ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    className="rounded-full bg-[#f4efe6] px-2.5 py-1 text-xs text-[#0B192C]"
                    onClick={() => setBody(reply.text)}
                  >
                    {reply.label}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                className="mb-2 w-full rounded-full border px-3 py-2 text-sm"
                aria-label="Modèle approuvé"
              >
                <option value="">Choisir un modèle</option>
                {templates.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              placeholder={windowOpen ? "Écrire au client" : "Le texte libre attend la fenêtre de 24 h"}
              disabled={!windowOpen}
              className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm disabled:bg-[#f6f3ee]"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <input id="wa-file" type="file" accept="image/*,application/pdf" className="text-xs" aria-label="Pièce jointe" />
              <button type="submit" className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm" disabled={busy || (previewBlocked && !offline)}>
                Envoyer
              </button>
            </div>
            {note ? <p className="mt-2 text-sm text-[#0B192C]">{note}</p> : null}
          </form>
        ) : null}
      </section>

      {embedded ? null : (
        <aside className="hidden rounded-3xl border border-[var(--border)] bg-white p-4 lg:block">
          <h2 className="text-sm font-semibold text-[#0B192C]">Dossier</h2>
          {active && dossier ? (
            <DossierFacts dossier={dossier} />
          ) : (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Le client et le séjour du fil apparaissent ici.</p>
          )}
        </aside>
      )}
    </div>
  );
}

function DossierFacts({ dossier }: { dossier: InboxDossier }) {
  return (
    <dl className="mt-2 space-y-2 text-sm text-[#0B192C]">
      {dossier.reference ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[#8a7350]">Séjour</dt>
          <dd>
            {dossier.reference}
            {dossier.place ? ` · ${dossier.place}` : ""}
          </dd>
        </div>
      ) : null}
      {dossier.dates ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[#8a7350]">Dates</dt>
          <dd>{dossier.dates}</dd>
        </div>
      ) : null}
      {dossier.visibility ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[#8a7350]">État</dt>
          <dd>{dossier.visibility}</dd>
        </div>
      ) : null}
      {dossier.travelers.length ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[#8a7350]">Voyageurs</dt>
          <dd>{dossier.travelers.join(", ")}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[#8a7350]">Passeports</dt>
        <dd>{dossier.missingPassports ? `${dossier.missingPassports} manquant${dossier.missingPassports > 1 ? "s" : ""}` : "Au dossier"}</dd>
      </div>
      {dossier.request ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[#8a7350]">Demande</dt>
          <dd>{dossier.request}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function applyHandoff(
  active: InboxThread,
  result: HandoffResult,
  seenServer: boolean,
  setLocalHold: (value: { key: string; held: boolean; seenServer: boolean; notes: InboxMessage[] }) => void,
  refresh: () => void
) {
  const note: InboxMessage | null =
    result.line && result.at
      ? {
          id: `handoff-${result.at}`,
          phone: active.phone,
          customerId: active.customerId,
          customerName: active.customerName,
          bookingId: active.bookingId,
          bookingReference: active.bookingReference,
          direction: "outbound",
          body: result.line,
          createdAt: result.at,
          status: "sent",
          templateKey: "systeme",
          authorName: null,
          mediaPath: null,
          tools: [],
          requestId: null,
        }
      : null;
  setLocalHold({
    key: active.key,
    held: result.status === "agency",
    seenServer,
    notes: note ? [note] : [],
  });
  refresh();
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function askWhatsappNotifications() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  await Notification.requestPermission();
}
