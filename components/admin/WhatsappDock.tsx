"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import { createClient } from "@/lib/supabase/client";
import {
  applyDockMessage,
  BUBBLE_STORAGE_KEY,
  clampBubblePosition,
  clearDockUnread,
  closeDockTab,
  collapseDockTab,
  defaultBubblePosition,
  DOCK_MOBILE_MQ,
  DOCK_STORAGE_KEY,
  dockInitials,
  dockLabel,
  dockStatusLabel,
  freshDockThreads,
  inboundDockTabs,
  openDockTab,
  readDockState,
  splitDockTabs,
  type BubbleFrame,
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
  const drawerRef = useRef(drawer);
  const expandedKeyRef = useRef<string | null>(null);

  function arrive(message: InboxMessage) {
    const key = threadKey(message);
    if (!key) return;
    const mark = `${key}:${message.createdAt}`;
    const known = seen.current.has(mark);
    seen.current.add(mark);
    setThreads((current) => applyDockMessage(current, message));
    if (known || !booted.current || message.direction !== "inbound") return;
    setTabs((current) => inboundDockTabs(current, key, dockIsMobile()));
    chime();
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      new Notification("WhatsApp", { body: message.body.slice(0, 120) });
    }
  }

  useEffect(() => {
    panelRef.current = panelOpen;
    tabsRef.current = tabs;
    threadsRef.current = threads;
    drawerRef.current = drawer;
    arriveRef.current = arrive;
    setTabsRef.current = setTabs;
  });

  useEffect(() => {
    for (const thread of threads) {
      if (thread.lastAt) seen.current.add(`${thread.key}:${thread.lastAt}`);
    }
    booted.current = true;
  }, [threads]);

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
            onTabs((current) => inboundDockTabs(current, thread.key, dockIsMobile()));
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
  const unread = threads.reduce((sum, thread) => sum + thread.unread, 0);
  const chatFrame = useVisualFrame(Boolean(expanded));
  const listFrame = useVisualFrame(drawer);
  const chatSwipe = useSwipeDown(() => {
    const key = expandedKeyRef.current;
    if (key) setTabs((current) => closeDockTab(current, key));
  });
  const listSwipe = useSwipeDown(() => setDrawer(false));

  useEffect(() => {
    expandedKeyRef.current = expanded?.key ?? null;
    const lock = dockIsMobile() && (drawer || Boolean(expanded));
    if (lock && document.body.dataset.waDockLock !== "1") {
      document.body.dataset.waDockPrev = document.body.style.overflow;
      document.body.dataset.waDockLock = "1";
      document.body.style.overflow = "hidden";
    } else if (!lock && document.body.dataset.waDockLock === "1") {
      document.body.style.overflow = document.body.dataset.waDockPrev || "";
      delete document.body.dataset.waDockLock;
      delete document.body.dataset.waDockPrev;
    }
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !dockIsMobile()) return;
      const key = expandedKeyRef.current;
      if (!key && !drawerRef.current) return;
      event.preventDefault();
      if (key) {
        setTabsRef.current((current) => closeDockTab(current, key));
        return;
      }
      setDrawer(false);
    }
    const mobileQuery = window.matchMedia(DOCK_MOBILE_MQ);
    function onViewport() {
      if (!mobileQuery.matches) setDrawer(false);
    }
    mobileQuery.addEventListener("change", onViewport);
    window.addEventListener("keydown", onKey);
    return () => {
      mobileQuery.removeEventListener("change", onViewport);
      window.removeEventListener("keydown", onKey);
      if (document.body.dataset.waDockLock === "1") {
        document.body.style.overflow = document.body.dataset.waDockPrev || "";
        delete document.body.dataset.waDockLock;
        delete document.body.dataset.waDockPrev;
      }
    };
  }, []);

  function closeExpanded() {
    if (!expanded) return;
    setTabs((current) => closeDockTab(current, expanded.key));
  }

  function minimiseExpanded() {
    if (!expanded) return;
    setTabs((current) => collapseDockTab(current, expanded.key));
  }

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
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="Discussions WhatsApp">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[#0B192C] px-3 py-3 text-white max-lg:px-2 max-lg:py-1">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">Discussions</p>
        <button type="button" className="text-xs text-[#C5A880] max-lg:hidden" onClick={() => { setPanelOpen(false); setDrawer(false); }}>
          Replier
        </button>
        <button type="button" aria-label="Fermer les discussions" className={`${sheetIconButton} lg:hidden`} onClick={() => setDrawer(false)}>
          <Icon name="close" className="h-6 w-6" />
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
      <aside
        className={`sticky top-0 z-30 hidden h-dvh shrink-0 border-l border-[var(--border)] bg-white lg:flex lg:flex-col ${panelOpen ? "w-80" : "w-11"}`}
      >
        {panelOpen && !drawer ? (
          panel
        ) : (
          <button
            type="button"
            onClick={() => {
              setDrawer(false);
              setPanelOpen(true);
            }}
            aria-expanded={false}
            aria-label={unread > 0 ? `Ouvrir les discussions, ${unread} non lus` : "Ouvrir les discussions"}
            className="flex h-full w-full flex-col items-center gap-3 bg-[#0B192C] py-5 text-[#C5A880]"
          >
            <Icon name="forum" className="h-5 w-5" />
            {unread > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#C5A880] px-1.5 text-[10px] font-semibold text-[#0B192C]">
                {unread}
              </span>
            ) : null}
          </button>
        )}
      </aside>

      {drawer ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Discussions WhatsApp"
          className={`fixed inset-x-0 z-[70] flex flex-col overflow-hidden bg-white lg:hidden ${listFrame.height ? "" : "h-dvh"}`}
          style={mobileSheetStyle(listFrame, listSwipe.offset)}
          onPointerDown={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientY - bounds.top > 140) return;
            listSwipe.binds.onPointerDown(event);
          }}
          onPointerMove={listSwipe.binds.onPointerMove}
          onPointerUp={listSwipe.binds.onPointerUp}
          onPointerCancel={listSwipe.binds.onPointerCancel}
        >
          <div className="flex h-6 shrink-0 items-center justify-center bg-[#0B192C]" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-white/40" />
          </div>
          {panel}
        </div>
      ) : (
        <DockBubble unread={unread} hidden={Boolean(expanded)} onOpen={() => setDrawer(true)} />
      )}

      <div className={`fixed bottom-0 z-50 hidden items-end gap-2 lg:flex ${panelOpen ? "right-80" : "right-11"}`}>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Discussion avec ${dockLabel(expandedThread)}`}
          className={`fixed inset-x-0 z-[80] flex flex-col overflow-hidden bg-[#efe7da] lg:hidden ${chatFrame.height ? "" : "h-dvh"}`}
          style={mobileSheetStyle(chatFrame, chatSwipe.offset)}
        >
          <ChatPane
            sheet
            thread={expandedThread}
            messages={messages}
            templates={templates}
            windowOpen={windowOpen}
            previewBlocked={previewBlocked}
            draft={draft}
            template={template}
            note={note}
            busy={busy}
            swipe={chatSwipe.binds}
            onClose={closeExpanded}
            onMinimise={minimiseExpanded}
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
  sheet = false,
  swipe,
  onClose,
  onMinimise,
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
  sheet?: boolean;
  swipe?: SwipeBinds;
  onClose?: () => void;
  onMinimise?: () => void;
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
  const label = dockLabel(thread);
  const linkClass = sheet ? "inline-flex min-h-11 items-center underline" : "underline";
  return (
    <div className={sheet ? "flex h-full min-h-0 flex-1 flex-col bg-[#efe7da]" : "flex max-h-[28rem] flex-col bg-[#efe7da]"}>
      {sheet ? (
        <header className="shrink-0 bg-[#0B192C] text-white" style={{ touchAction: "none" }} {...swipe}>
          <div className="flex justify-center pt-2" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-white/40" />
          </div>
          <div className="flex items-center gap-1 px-2 pb-1">
            <button type="button" aria-label="Retour" className={sheetIconButton} onClick={onMinimise}>
              <Icon name="chevron_left" className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-[#C5A880]">{dockStatusLabel(thread.status)}</p>
            </div>
            <button type="button" aria-label={`Réduire ${label}`} className={sheetIconButton} onClick={onMinimise}>
              <Icon name="minus" className="h-6 w-6" />
            </button>
            <button type="button" aria-label={`Fermer ${label}`} className={sheetIconButton} onClick={onClose}>
              <Icon name="close" className="h-6 w-6" />
            </button>
          </div>
          <div className="flex justify-end px-3 pb-2">
            <button type="button" className="inline-flex min-h-11 items-center rounded-full bg-[#C5A880] px-3 text-xs font-medium text-[#0B192C]" onClick={onResume}>
              Rendre au Concierge
            </button>
          </div>
        </header>
      ) : (
        <header className="flex items-start justify-between gap-2 bg-[#0B192C] px-3 py-2 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#C5A880]">{dockStatusLabel(thread.status)}</p>
          </div>
          <button type="button" className="shrink-0 rounded-full bg-[#C5A880] px-2 py-1 text-[10px] text-[#0B192C]" onClick={onResume}>
            Rendre au Concierge
          </button>
        </header>
      )}
      <div className={sheet ? "flex shrink-0 gap-3 px-3 text-sm" : "flex gap-2 px-3 py-1 text-[10px]"}>
        {thread.customerId ? <Link className={linkClass} href={`/admin/clients/${thread.customerId}`}>Fiche</Link> : null}
        {thread.bookingId ? <Link className={linkClass} href={`/admin/reservations/${thread.bookingId}?onglet=whatsapp`}>Dossier</Link> : null}
        {thread.phone ? <Link className={linkClass} href={`/admin/whatsapp?fil=${encodeURIComponent(thread.phone)}`}>Fil complet</Link> : null}
      </div>
      <div className={sheet ? "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 py-2" : "min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2"}>
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
        className={sheet ? "shrink-0 bg-white p-2" : "bg-white p-2"}
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
          <button type="submit" disabled={busy || previewBlocked} className={sheet ? "inline-flex h-11 items-center rounded-full bg-[#0B192C] px-4 text-sm text-white disabled:opacity-50" : "rounded-full bg-[#0B192C] px-3 py-1 text-xs text-white disabled:opacity-50"}>
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

const sheetIconButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white";

type SwipeBinds = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

function dockIsMobile() {
  return typeof window !== "undefined" && window.matchMedia(DOCK_MOBILE_MQ).matches;
}

function useVisualFrame(active: boolean) {
  const [frame, setFrame] = useState({ top: 0, height: 0, keyboard: false });
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => {
      const keyboard = window.innerHeight - viewport.height - viewport.offsetTop > 80;
      setFrame({ top: viewport.offsetTop, height: viewport.height, keyboard });
    };
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    window.requestAnimationFrame(sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [active]);
  return frame;
}

function mobileSheetStyle(frame: { top: number; height: number; keyboard: boolean }, drag: number): CSSProperties {
  return {
    top: frame.height ? frame.top : 0,
    height: frame.height || undefined,
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: frame.keyboard ? "0px" : "env(safe-area-inset-bottom)",
    transform: drag > 0 ? `translateY(${Math.min(drag, 220)}px)` : undefined,
  };
}

function useSwipeDown(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const binds: SwipeBinds = {
    onPointerDown(event) {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, textarea, select")) return;
      start.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      if (!start.current) return;
      const dy = event.clientY - start.current.y;
      const dx = event.clientX - start.current.x;
      if (dy <= 0 || Math.abs(dx) > dy) {
        setOffset(0);
        return;
      }
      setOffset(dy);
    },
    onPointerUp(event) {
      if (!start.current) return;
      const dy = event.clientY - start.current.y;
      const dx = Math.abs(event.clientX - start.current.x);
      start.current = null;
      setOffset(0);
      if (dy > 72 && dy > dx) onCloseRef.current();
    },
    onPointerCancel() {
      start.current = null;
      setOffset(0);
    },
  };
  return { offset, binds };
}

const bubbleListeners = new Set<() => void>();
let bubbleDrag: { x: number; y: number } | null = null;

function subscribeBubble(callback: () => void) {
  bubbleListeners.add(callback);
  window.addEventListener("resize", callback);
  return () => {
    bubbleListeners.delete(callback);
    window.removeEventListener("resize", callback);
  };
}

function publishBubble() {
  for (const listener of bubbleListeners) listener();
}

function readBubbleSnapshot() {
  const saved = bubbleDrag || readSavedBubble();
  if (!saved) return "";
  const next = clampBubblePosition(saved, measureBubbleFrame());
  return `${Math.round(next.x)}:${Math.round(next.y)}`;
}

function parseBubblePoint(raw: string) {
  if (!raw) return null;
  const [x, y] = raw.split(":").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function placeBubble(point: { x: number; y: number }, persist: boolean) {
  bubbleDrag = point;
  if (persist) {
    try {
      window.localStorage.setItem(BUBBLE_STORAGE_KEY, JSON.stringify(point));
    } catch {
      // La bulle reste où le doigt l’a laissée pour cette page.
    }
  }
  publishBubble();
}

function DockBubble({ unread, hidden, onOpen }: { unread: number; hidden: boolean; onOpen: () => void }) {
  const raw = useSyncExternalStore(subscribeBubble, readBubbleSnapshot, () => "");
  const point = parseBubblePoint(raw);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  if (hidden) return null;
  const label =
    unread > 1 ? `Discussions WhatsApp, ${unread} non lus` : unread === 1 ? "Discussions WhatsApp, 1 non lu" : "Discussions WhatsApp";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const origin = point ?? defaultBubblePosition(measureBubbleFrame());
        drag.current = { x: event.clientX, y: event.clientY, left: origin.x, top: origin.y, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (Math.hypot(dx, dy) > 8) current.moved = true;
        if (!current.moved) return;
        placeBubble(clampBubblePosition({ x: current.left + dx, y: current.top + dy }, measureBubbleFrame()), false);
      }}
      onPointerUp={() => {
        const current = drag.current;
        drag.current = null;
        if (!current?.moved || !bubbleDrag) return;
        suppressClick.current = true;
        placeBubble(bubbleDrag, true);
      }}
      style={point ? { left: point.x, top: point.y, right: "auto", bottom: "auto", touchAction: "none" } : { touchAction: "none" }}
      className={
        point
          ? "fixed z-[55] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0B192C] text-[#C5A880] shadow-lg lg:hidden"
          : "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[55] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0B192C] text-[#C5A880] shadow-lg lg:hidden"
      }
    >
      <Icon name="forum" className="h-6 w-6" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A880] px-1.5 text-[10px] font-semibold text-[#0B192C]">
          {unread}
        </span>
      ) : null}
    </button>
  );
}

function measureBubbleFrame(): BubbleFrame {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    topInset: readSafeInset("top"),
    bottomInset: readSafeInset("bottom"),
  };
}

function readSafeInset(edge: "top" | "bottom") {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingTop = "env(safe-area-inset-top)";
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const raw = edge === "top" ? style.paddingTop : style.paddingBottom;
  probe.remove();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function readSavedBubble() {
  try {
    const raw = window.localStorage.getItem(BUBBLE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof data.x !== "number" || typeof data.y !== "number") return null;
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return null;
    return { x: data.x, y: data.y };
  } catch {
    return null;
  }
}
