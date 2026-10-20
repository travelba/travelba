"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  applyDockMessage,
  clearDockUnread,
  closeDockTab,
  collapseDockTab,
  DOCK_STORAGE_KEY,
  dockInitials,
  dockLabel,
  dockStatusLabel,
  ensureDockTab,
  freshDockThreads,
  openDockTab,
  readDockState,
  splitDockTabs,
  type DockTab,
} from "@/lib/crm/whatsapp-dock";
import {
  deliveryLabel,
  filterThreads,
  messageSpeaker,
  parisStamp,
  sessionWindowOpenNow,
  speakerLabel,
  threadKey,
  type InboxMessage,
  type InboxThread,
} from "@/lib/crm/whatsapp-inbox";

export function WhatsappDock({
  threads: initialThreads,
  templates,
  previewBlocked,
  messagesByKey = {},
  initialPanelOpen = false,
  initialTabs = [],
  initialDrawer = false,
  persist = true,
  live = true,
  anchor = "admin",
}: {
  threads: InboxThread[];
  templates: { key: string; label: string }[];
  previewBlocked: boolean;
  messagesByKey?: Record<string, InboxMessage[]>;
  initialPanelOpen?: boolean;
  initialTabs?: DockTab[];
  initialDrawer?: boolean;
  persist?: boolean;
  live?: boolean;
  anchor?: "admin" | "page";
}) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [threadSource, setThreadSource] = useState(initialThreads);
  if (threadSource !== initialThreads) {
    setThreadSource(initialThreads);
    setThreads(initialThreads);
  }
  const storedRaw = useSyncExternalStore(subscribeDock, readDockRaw, () => "");
  const stored = readDockState(storedRaw);
  const [localPanel, setLocalPanel] = useState(initialPanelOpen);
  const [localTabs, setLocalTabs] = useState<DockTab[]>(initialTabs);
  const [drawer, setDrawer] = useState(initialDrawer);
  const panelOpen = persist ? stored.panelOpen : localPanel;
  const tabs = persist ? stored.tabs : localTabs;
  const panelRef = useRef(panelOpen);
  const tabsRef = useRef(tabs);
  function setPanelOpen(open: boolean) {
    panelRef.current = open;
    if (!persist) {
      setLocalPanel(open);
      return;
    }
    writeDock({ panelOpen: open, tabs: tabsRef.current });
  }
  function setTabs(next: DockTab[] | ((current: DockTab[]) => DockTab[])) {
    const resolved = typeof next === "function" ? next(tabsRef.current) : next;
    tabsRef.current = resolved;
    if (!persist) {
      setLocalTabs(resolved);
      return;
    }
    writeDock({ panelOpen: panelRef.current, tabs: resolved });
  }
  const [query, setQuery] = useState("");
  const [cache, setCache] = useState(messagesByKey);
  const [draft, setDraft] = useState("");
  const [template, setTemplate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const booted = useRef(false);
  const arriveRef = useRef<(message: InboxMessage) => void>(() => undefined);
  const setTabsRef = useRef<(next: DockTab[] | ((current: DockTab[]) => DockTab[])) => void>(() => undefined);
  const seen = useRef(new Set<string>());
  const threadsRef = useRef(threads);

  useEffect(() => {
    panelRef.current = panelOpen;
    tabsRef.current = tabs;
    threadsRef.current = threads;
    arriveRef.current = arrive;
    setTabsRef.current = setTabs;
  });

  useEffect(() => {
    for (const thread of threads) {
      if (thread.lastAt) seen.current.add(`${thread.key}:${thread.lastAt}`);
    }
    booted.current = true;
  }, [threads]);

  function arrive(message: InboxMessage) {
    const key = threadKey(message);
    if (!key) return;
    const mark = `${key}:${message.createdAt}`;
    const known = seen.current.has(mark);
    seen.current.add(mark);
    setThreads((current) => applyDockMessage(current, message));
    if (known || !booted.current || message.direction !== "inbound") return;
    setTabs((current) => ensureDockTab(current, key));
    chime();
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      new Notification("WhatsApp", { body: message.body.slice(0, 120) });
    }
  }

  useEffect(() => {
    if (!live) return;
    const onArrive = (message: InboxMessage) => arriveRef.current(message);
    const onTabs = (next: DockTab[] | ((current: DockTab[]) => DockTab[])) => setTabsRef.current(next);
    let supabase: ReturnType<typeof createClient> | null = null;
    try {
      supabase = createClient();
    } catch {
      supabase = null;
    }
    const channel = supabase?.channel("whatsapp-dock");
    channel?.on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_whatsapp_messages" }, (payload) => {
        const row = payload.new as {
          id?: string;
          phone?: string | null;
          customer_id?: string | null;
          booking_id?: string | null;
          direction?: string;
          body?: string;
          created_at?: string;
          status?: string | null;
          template_key?: string | null;
        };
        if (!row?.id || !row.created_at) return;
        onArrive({
          id: row.id,
          phone: row.phone || null,
          customerId: row.customer_id || null,
          customerName: null,
          bookingId: row.booking_id || null,
          bookingReference: null,
          direction: row.direction === "inbound" ? "inbound" : "outbound",
          body: row.body || "",
          createdAt: row.created_at,
          status: row.status || null,
          templateKey: row.template_key || null,
          authorName: null,
          mediaPath: null,
          tools: [],
          requestId: null,
        });
      })
      .subscribe();
    const timer = window.setInterval(() => {
      void fetch("/api/admin/whatsapp")
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { threads?: InboxThread[] } | null) => {
          if (!body?.threads) return;
          const arrived = freshDockThreads(threadsRef.current, body.threads);
          setThreads(body.threads);
          for (const thread of arrived) {
            const mark = `${thread.key}:${thread.lastAt}`;
            if (seen.current.has(mark)) continue;
            seen.current.add(mark);
            if (!booted.current) continue;
            onTabs((current) => ensureDockTab(current, thread.key));
            chime();
          }
        })
        .catch(() => undefined);
    }, 12_000);
    return () => {
      window.clearInterval(timer);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [live]);

  const visibleThreads = useMemo(() => filterThreads(threads, { query }), [threads, query]);
  const expanded = tabs.find((tab) => tab.expanded) || null;
  const expandedThread = threads.find((thread) => thread.key === expanded?.key) || null;
  const { visible, overflow } = splitDockTabs(tabs);
  const messages = expanded ? cache[expanded.key] || [] : [];
  const lastInbound = [...messages].filter((row) => row.direction === "inbound").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const windowOpen = sessionWindowOpenNow(lastInbound?.createdAt || null);
  const left = anchor === "admin" ? "lg:left-72" : "lg:left-0";

  function choose(key: string) {
    setTabs((current) => openDockTab(current, key, true));
    setThreads((current) => clearDockUnread(current, key));
    setDrawer(false);
    setOverflowOpen(false);
    const thread = threads.find((row) => row.key === key);
    if (live && thread?.phone) void post({ action: "read", phone: thread.phone, customerId: thread.customerId }, false);
    if (!cache[key] && live) void loadThread(key);
  }

  async function loadThread(key: string) {
    const response = await fetch(`/api/admin/whatsapp?fil=${encodeURIComponent(key)}`);
    if (!response.ok) return;
    const body = (await response.json()) as { messages?: InboxMessage[] };
    if (body.messages) setCache((current) => ({ ...current, [key]: body.messages || [] }));
  }

  async function post(payload: Record<string, unknown>, refresh: boolean) {
    if (!live) return false;
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
    if (refresh) router.refresh();
    return true;
  }

  async function send() {
    if (!expandedThread?.phone || previewBlocked) return;
    const ok = await post(
      {
        action: "reply",
        phone: expandedThread.phone,
        customerId: expandedThread.customerId,
        bookingId: expandedThread.bookingId,
        body: draft,
        template: windowOpen ? "" : template,
      },
      true
    );
    if (ok && expanded) {
      setDraft("");
      setNote(previewBlocked ? "Aperçu : rien n’est parti." : "Message envoyé. Le Concierge est en pause.");
      void loadThread(expanded.key);
    }
  }

  const panel = (
    <section className="flex h-full flex-col bg-white" aria-label="Discussions WhatsApp">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[#0B192C] px-3 py-3 text-white">
        <p className="text-sm font-medium">Discussions</p>
        <button type="button" className="text-xs text-[#C5A880]" onClick={() => { setPanelOpen(false); setDrawer(false); }}>
          Replier
        </button>
      </header>
      <div className="border-b border-[var(--border)] p-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom, numéro, message"
          aria-label="Rechercher une discussion"
          className="w-full rounded-full border border-[var(--border)] px-3 py-2 text-sm"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visibleThreads.map((thread) => (
          <li key={thread.key}>
            <button
              type="button"
              onClick={() => choose(thread.key)}
              className={`flex w-full items-start gap-2 border-b border-[var(--border)] px-3 py-2.5 text-left ${expanded?.key === thread.key ? "bg-[#f7f1e6]" : ""}`}
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-[11px] font-semibold text-[#C5A880]">
                {dockInitials(thread)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[#0B192C]">{dockLabel(thread)}</span>
                  <span className="shrink-0 text-[10px] text-[#8a7350]">{parisStamp(thread.lastAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--color-ink-soft)]">{thread.lastBody}</span>
                <span className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[#8a7350]">
                  <span>{dockStatusLabel(thread.status)}</span>
                  {thread.unread > 0 ? (
                    <span className="rounded-full bg-[#C5A880] px-1.5 text-[#0B192C]">{thread.unread}</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        ))}
        {visibleThreads.length ? null : <li className="p-4 text-sm text-[var(--color-ink-soft)]">Aucune discussion.</li>}
      </ul>
    </section>
  );

  return (
    <>
      {panelOpen ? (
        <aside className={`fixed bottom-0 top-20 z-40 hidden w-80 border-r border-[var(--border)] shadow-[8px_0_24px_rgba(11,25,44,0.06)] lg:block ${left}`}>
          {panel}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className={`fixed top-24 z-40 hidden rounded-r-2xl bg-[#0B192C] px-2 py-3 text-[10px] uppercase tracking-wide text-[#C5A880] lg:block ${left}`}
        >
          Discussions
          {threads.some((thread) => thread.unread > 0) ? (
            <span className="mt-1 block rounded-full bg-[#C5A880] text-[#0B192C]">{threads.reduce((sum, thread) => sum + thread.unread, 0)}</span>
          ) : null}
        </button>
      )}

      {drawer ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button type="button" aria-label="Fermer les discussions" className="absolute inset-0 bg-[#0B192C]/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(100%,22rem)] shadow-xl">{panel}</aside>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Discussions WhatsApp"
        onClick={() => setDrawer(true)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[55] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0B192C] text-xs font-semibold text-[#C5A880] shadow-lg lg:hidden"
      >
        WA
        {threads.some((thread) => thread.unread > 0) ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-[#C5A880] px-1.5 text-[10px] text-[#0B192C]">
            {threads.reduce((sum, thread) => sum + thread.unread, 0)}
          </span>
        ) : null}
      </button>

      <div className="fixed bottom-0 right-3 z-50 hidden items-end gap-2 lg:flex">
        {overflow.length ? (
          <div className="relative mb-3">
            <button
              type="button"
              className="rounded-t-2xl bg-[#0B192C] px-3 py-2 text-xs text-white"
              onClick={() => setOverflowOpen((open) => !open)}
            >
              +{overflow.length}
            </button>
            {overflowOpen ? (
              <ul className="absolute bottom-10 right-0 w-52 rounded-2xl border border-[var(--border)] bg-white p-1 shadow-lg">
                {overflow.map((tab) => {
                  const thread = threads.find((row) => row.key === tab.key);
                  return (
                    <li key={tab.key}>
                      <button type="button" className="block w-full truncate rounded-xl px-2 py-1.5 text-left text-sm" onClick={() => choose(tab.key)}>
                        {thread ? dockLabel(thread) : tab.key}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
        {visible.map((tab) => {
          const thread = threads.find((row) => row.key === tab.key);
          const label = thread ? dockLabel(thread) : tab.key;
          return (
            <div key={tab.key} className="flex w-60 flex-col">
              {tab.expanded && expandedThread ? (
                <ChatPane
                  thread={expandedThread}
                  messages={messages}
                  templates={templates}
                  windowOpen={windowOpen}
                  previewBlocked={previewBlocked}
                  draft={draft}
                  template={template}
                  note={note}
                  busy={busy}
                  onDraft={setDraft}
                  onTemplate={setTemplate}
                  onSend={() => void send()}
                  onResume={() => void post({ action: "resume", phone: expandedThread.phone }, true)}
                />
              ) : null}
              <div className="flex items-center gap-1 rounded-t-2xl bg-[#0B192C] px-2 py-2 text-white">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => (tab.expanded ? setTabs((current) => collapseDockTab(current, tab.key)) : choose(tab.key))}>
                  {label}
                </button>
                {thread && thread.unread > 0 ? <span className="rounded-full bg-[#C5A880] px-1.5 text-[10px] text-[#0B192C]">{thread.unread}</span> : null}
                <span className="text-[10px] uppercase text-[#C5A880]">{thread ? dockStatusLabel(thread.status) : ""}</span>
                <button type="button" aria-label={`Fermer ${label}`} className="px-1 text-xs text-white/70" onClick={() => setTabs((current) => closeDockTab(current, tab.key))}>
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {expandedThread && expanded ? (
        <div className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[65] max-h-[70vh] overflow-hidden rounded-3xl shadow-xl lg:hidden">
          <ChatPane
            thread={expandedThread}
            messages={messages}
            templates={templates}
            windowOpen={windowOpen}
            previewBlocked={previewBlocked}
            draft={draft}
            template={template}
            note={note}
            busy={busy}
            onDraft={setDraft}
            onTemplate={setTemplate}
            onSend={() => void send()}
            onResume={() => void post({ action: "resume", phone: expandedThread.phone }, true)}
          />
        </div>
      ) : null}
    </>
  );
}

function ChatPane({
  thread,
  messages,
  templates,
  windowOpen,
  previewBlocked,
  draft,
  template,
  note,
  busy,
  onDraft,
  onTemplate,
  onSend,
  onResume,
}: {
  thread: InboxThread;
  messages: InboxMessage[];
  templates: { key: string; label: string }[];
  windowOpen: boolean;
  previewBlocked: boolean;
  draft: string;
  template: string;
  note: string;
  busy: boolean;
  onDraft: (value: string) => void;
  onTemplate: (value: string) => void;
  onSend: () => void;
  onResume: () => void;
}) {
  const ordered = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <div className="flex max-h-[28rem] flex-col bg-[#efe7da]">
      <header className="flex items-start justify-between gap-2 bg-[#0B192C] px-3 py-2 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{dockLabel(thread)}</p>
          <p className="text-[10px] uppercase tracking-wide text-[#C5A880]">{dockStatusLabel(thread.status)}</p>
        </div>
        <button type="button" className="shrink-0 rounded-full bg-[#C5A880] px-2 py-1 text-[10px] text-[#0B192C]" onClick={onResume}>
          Rendre au Concierge
        </button>
      </header>
      <div className="flex gap-2 px-3 py-1 text-[10px]">
        {thread.customerId ? <Link className="underline" href={`/admin/clients/${thread.customerId}`}>Fiche</Link> : null}
        {thread.bookingId ? <Link className="underline" href={`/admin/reservations/${thread.bookingId}?onglet=whatsapp`}>Dossier</Link> : null}
        {thread.phone ? <Link className="underline" href={`/admin/whatsapp?fil=${encodeURIComponent(thread.phone)}`}>Fil complet</Link> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {ordered.map((message) => {
          const speaker = messageSpeaker(message);
          const mine = speaker !== "client";
          return (
            <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-2xl px-2.5 py-1.5 text-xs ${speaker === "client" ? "bg-white" : speaker === "agency" ? "bg-[#0B192C] text-white" : "bg-[#f7f1e6]"}`}>
                <p className="text-[10px] uppercase tracking-wide text-[#C5A880]">{speakerLabel(speaker, message.authorName)}{speaker === "robot" ? " · robot" : ""}</p>
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className="mt-1 text-[10px] opacity-70">{parisStamp(message.createdAt)}{deliveryLabel(message.status) ? ` · ${deliveryLabel(message.status)}` : ""}</p>
              </div>
            </article>
          );
        })}
      </div>
      <form
        className="bg-white p-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <p className="mb-1 text-[10px] text-[var(--color-ink-soft)]">
          {windowOpen ? "Fenêtre de 24 h ouverte : texte libre." : "Au-delà de 24 h : un modèle déjà approuvé."}
          {previewBlocked ? " Aperçu : l’envoi est coupé." : ""}
        </p>
        {windowOpen ? null : (
          <select value={template} onChange={(event) => onTemplate(event.target.value)} className="mb-1 w-full rounded-full border px-2 py-1 text-xs" aria-label="Modèle approuvé">
            <option value="">Choisir un modèle</option>
            {templates.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        )}
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} rows={2} disabled={!windowOpen} placeholder={windowOpen ? "Écrire au client" : "Texte libre hors fenêtre"} className="w-full rounded-2xl border px-2 py-1 text-xs disabled:bg-[#f6f3ee]" />
        <div className="mt-1 flex justify-end">
          <button type="submit" disabled={busy || previewBlocked} className="rounded-full bg-[#0B192C] px-3 py-1 text-xs text-white disabled:opacity-50">
            Envoyer
          </button>
        </div>
        {note ? <p className="mt-1 text-xs">{note}</p> : null}
      </form>
    </div>
  );
}

const dockListeners = new Set<() => void>();

function subscribeDock(callback: () => void) {
  dockListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    dockListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readDockRaw() {
  try {
    return window.localStorage.getItem(DOCK_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeDock(state: { panelOpen: boolean; tabs: DockTab[] }) {
  try {
    window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sans stockage, les onglets restent pour cette page.
  }
  for (const listener of dockListeners) listener();
}

function chime() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.value = 0.03;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15);
    oscillator.stop(context.currentTime + 0.16);
    window.setTimeout(() => void context.close(), 400);
  } catch {
    // Le navigateur peut refuser le son sans geste.
  }
}
