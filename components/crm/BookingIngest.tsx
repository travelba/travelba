"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUp,
  GripVertical,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { sortItemsByOrder } from "@/lib/crm/carnet";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";
import { DateFrInput, Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import {
  emptyBookingExtract,
  MAX_INGEST_BYTES,
  MAX_INGEST_FILES,
  sanitizeExtractedPrices,
  type BookingExtract,
  type IngestStreamEvent,
  type IngestWarning,
} from "@/lib/crm/ingest-types";
import { findMatchingItem, mergeExtractItems } from "@/lib/crm/item-match";
import { IngestItemCard } from "@/components/crm/IngestItemCard";

type ItemDraft = BookingExtract["items"][number];
type SlotStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "reading"
  | "ok"
  | "error"
  | "identity";

type Slot = {
  id: string;
  file: File;
  previewUrl: string | null;
  path: string | null;
  uploadPct: number;
  status: SlotStatus;
  family?: string;
  message?: string;
};

function emptyItem(): ItemDraft {
  return {
    kind: "hotel",
    title: "",
    supplier: "",
    confirmation_ref: "",
    start_at: "",
    end_at: "",
    amount: null,
    details: {},
  };
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusLabel(status: SlotStatus) {
  if (status === "uploading") return "Envoi…";
  if (status === "uploaded") return "Prêt";
  if (status === "reading") return "Lecture…";
  if (status === "ok") return "Lu";
  if (status === "error") return "Erreur";
  if (status === "identity") return "Pièce d’identité";
  return "En attente";
}

async function putSigned(url: string, file: File, onProgress: (pct: number) => void, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Envoi impossible"));
    };
    xhr.onerror = () => reject(new Error("Envoi impossible"));
    xhr.onabort = () => reject(new Error("Envoi annulé"));
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(file);
  });
}

async function readNdjson(res: Response, onEvent: (event: IngestStreamEvent) => void) {
  if (!res.body) {
    const json = await res.json();
    if (json.extract) {
      onEvent({
        event: "done",
        extract: json.extract,
        suggested_customer_id: json.suggested_customer_id || null,
        warnings: json.warnings || [],
      });
    } else {
      throw new Error(json.error || "Lecture impossible");
    }
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const trim = line.trim();
      if (!trim) continue;
      onEvent(JSON.parse(trim) as IngestStreamEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as IngestStreamEvent);
}

function mergeRetryExtract(
  previous: BookingExtract | null,
  incoming: BookingExtract,
  retried: Set<string>
): BookingExtract {
  if (!previous) return incoming;
  const kept = (previous.items || []).filter(
    (item) => !retried.has(String(item.details?.source_file_name || ""))
  );
  const merged = sanitizeExtractedPrices({
    ...previous,
    ...incoming,
    title: incoming.title || previous.title,
    destination: incoming.destination || previous.destination,
    notes_client: [previous.notes_client, incoming.notes_client]
      .map((row) => (row || "").trim())
      .filter(Boolean)
      .join("\n"),
    items: mergeExtractItems([...kept, ...(incoming.items || [])]),
    travelers: [...(previous.travelers || []), ...(incoming.travelers || [])],
  });
  return {
    ...merged,
    total_amount: previous.total_amount,
    items: merged.items.map((item) => {
      const prev = findMatchingItem(kept, item);
      return { ...item, amount: prev?.amount ?? item.amount };
    }),
  };
}

export function BookingIngest({
  role,
  mode,
  customers = [],
  ingestUrl,
  saveUrl,
  aiConfigured,
  redirectTo,
}: {
  role: "admin" | "client";
  mode: "create" | "append";
  customers?: CrmCustomer[];
  ingestUrl: string;
  saveUrl: string;
  aiConfigured: boolean;
  redirectTo?: (booking: { id: string; reference: string }) => string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [batchId, setBatchId] = useState(() => newId());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState<"idle" | "upload" | "read" | "save">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<IngestWarning[]>([]);
  const [extract, setExtract] = useState<BookingExtract | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const slotsRef = useRef<Slot[]>([]);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const slot of slotsRef.current) {
        if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      }
    };
  }, []);

  function patchSlot(id: string, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((file) => file.size > MAX_INGEST_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} dépasse 25 Mo.`);
      return;
    }
    setSlots((prev) => {
      const room = MAX_INGEST_FILES - prev.length;
      const next = incoming.slice(0, Math.max(0, room)).map((file) => ({
        id: newId(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        path: null,
        uploadPct: 0,
        status: "queued" as const,
      }));
      return [...prev, ...next];
    });
    setError(null);
  }

  async function removeSlot(id: string) {
    const slot = slots.find((row) => row.id === id);
    if (!slot) return;
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    if (slot.path) {
      try {
        await fetch("/api/admin/bookings/ingest/sign", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: slot.path }),
        });
      } catch {
        /* best-effort */
      }
    }
    setSlots((prev) => prev.filter((row) => row.id !== id));
  }

  async function uploadSlots(target: Slot[], signal: AbortSignal) {
    const ready: Slot[] = [];
    for (const slot of target) {
      if (slot.path) {
        ready.push(slot);
        continue;
      }
      patchSlot(slot.id, { status: "uploading", uploadPct: 0 });
      const signedRes = await fetch("/api/admin/bookings/ingest/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: slot.file.name,
          type: slot.file.type,
          size: slot.file.size,
          batchId,
        }),
        signal,
      });
      const signed = await signedRes.json();
      if (!signedRes.ok) throw new Error(signed.error || "Envoi impossible");
      await putSigned(signed.signedUrl, slot.file, (pct) => {
        patchSlot(slot.id, { uploadPct: pct, status: "uploading" });
      }, signal);
      const next = { ...slot, path: signed.path as string, status: "uploaded" as const, uploadPct: 100 };
      patchSlot(slot.id, { path: next.path, status: "uploaded", uploadPct: 100 });
      ready.push(next);
    }
    return ready;
  }

  async function runIngest(target: Slot[], retryNames?: Set<string>) {
    if (!target.length) {
      setError("Ajoutez un PDF ou une photo.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("upload");
    setError(null);
    try {
      const uploaded = await uploadSlots(target, controller.signal);
      setBusy("read");
      setProgress({ done: 0, total: uploaded.length, current: uploaded[0]?.file.name });
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          files: uploaded.map((slot) => ({
            path: slot.path,
            name: slot.file.name,
            type: slot.file.type || "",
          })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error || "Lecture impossible");
        }
        if (!res.body) {
          throw new Error("Lecture impossible");
        }
      }
      let fatal: string | null = null;
      await readNdjson(res, (event) => {
        if (event.event === "progress") {
          setProgress({ done: event.done, total: event.total, current: event.current });
        }
        if (event.event === "file") {
          setSlots((prev) =>
            prev.map((slot) =>
              slot.file.name === event.name
                ? {
                    ...slot,
                    status: event.status,
                    family: event.family,
                    message: event.message,
                  }
                : slot
            )
          );
          if (event.status === "reading") {
            setProgress({ done: event.index, total: event.total, current: event.name });
          }
        }
        if (event.event === "done") {
          setExtract((prev) => {
            const incoming = {
              ...emptyBookingExtract(),
              ...event.extract,
              items: sortItemsByOrder(event.extract.items || []),
            };
            return retryNames ? mergeRetryExtract(prev, incoming, retryNames) : incoming;
          });
          setWarnings(event.warnings || []);
          if (event.suggested_customer_id) setCustomerId(event.suggested_customer_id);
        }
        if (event.event === "fatal") fatal = event.error;
      });
      if (fatal) throw new Error(fatal);
    } catch (err) {
      if ((err as Error).name === "AbortError" || (err instanceof Error && err.message.includes("annul"))) {
        setError("Lecture annulée.");
      } else {
        setError(err instanceof Error ? err.message : "Lecture impossible");
      }
    } finally {
      abortRef.current = null;
      setBusy("idle");
      setProgress(null);
    }
  }

  function abortWork() {
    abortRef.current?.abort();
  }

  async function save() {
    if (!extract) return;
    if (role === "admin" && mode === "create" && !customerId) {
      setError("Choisissez un client.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const uploaded = await uploadSlots(slots, controller.signal);
      const body = new FormData();
      body.set("extract", JSON.stringify(extract));
      body.set("customer_id", customerId);
      body.set("batch_id", batchId);
      body.set(
        "staged",
        JSON.stringify(
          uploaded
            .filter((slot) => slot.path)
            .map((slot) => ({
              path: slot.path,
              name: slot.file.name,
              type: slot.file.type,
            }))
        )
      );
      const res = await fetch(saveUrl, { method: "POST", body, signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Enregistrement impossible");
      setExtract(null);
      setWarnings([]);
      for (const slot of slots) {
        if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      }
      setSlots([]);
      setBatchId(newId());
      if (json.booking && redirectTo) {
        router.push(redirectTo(json.booking));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      abortRef.current = null;
      setBusy("idle");
    }
  }

  function patch<K extends keyof BookingExtract>(key: K, value: BookingExtract[K]) {
    setExtract((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function patchItem(index: number, next: ItemDraft) {
    setExtract((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[index] = next;
      return { ...prev, items };
    });
  }

  const needsReview = Boolean(
    extract?.items.some((item) => item.details?.needs_review) ||
      (extract && !extract.items.length)
  );

  const sources = useMemo(() => {
    const names = new Set(
      (extract?.items || [])
        .map((item) => item.details?.source_file_name)
        .filter((name): name is string => Boolean(name))
    );
    return [...names];
  }, [extract]);

  const visibleItems = useMemo(() => {
    if (!extract) return [];
    if (sourceFilter === "all") return extract.items;
    return extract.items.filter((item) => item.details?.source_file_name === sourceFilter);
  }, [extract, sourceFilter]);

  const failedSlots = slots.filter((slot) => slot.status === "error");
  const reading = busy === "read" || busy === "upload";

  function startManual() {
    setExtract(emptyBookingExtract());
    setWarnings([]);
    setError(null);
  }

  return (
    <div className="admin-af-card space-y-4 rounded-3xl p-5">
      <div
        className="rounded-2xl border border-dashed border-[var(--admin-gold)]/70 bg-[var(--admin-sky)]/40 p-5"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--admin-navy)]">
            {reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-[var(--admin-navy)]">
              {mode === "append" ? "Ajouter des documents au dossier" : "Créer le dossier depuis les documents"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Billets, vouchers, devis, trains, voitures, bateaux (PDF ou photo). 30 fichiers, 25 Mo max.
              Rien n’est publié tant que vous n’avez pas cliqué sur Publier.
            </p>
            {!aiConfigured ? (
              <p className="mt-2 text-xs text-[var(--admin-navy)]">
                Lecture IA indisponible ici : seuls les documents reconnus (billets Amadeus, confirmations hôtel connues) sont lus. Le reste se saisit à la main.
              </p>
            ) : null}
            {progress ? (
              <p className="mt-2 text-sm font-medium text-[var(--admin-navy)]">
                {progress.done} / {progress.total}
                {progress.current ? ` — ${progress.current}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="admin-af-btn rounded-full px-4 py-2.5 text-sm"
            onClick={() => inputRef.current?.click()}
          >
            Choisir des fichiers
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {slots.length ? (
          <ul className="mt-4 space-y-2">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2 text-sm"
              >
                {slot.previewUrl ? (
                  <img
                    src={slot.previewUrl}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--admin-sky)] text-[var(--admin-navy)]">
                    {slot.file.type.includes("pdf") ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[var(--admin-navy)]">{slot.file.name}</p>
                  <p className="text-xs text-muted">
                    {formatBytes(slot.file.size)}
                    {slot.file.type ? ` · ${slot.file.type.replace("application/", "")}` : ""}
                    {" · "}
                    {statusLabel(slot.status)}
                    {slot.status === "uploading" ? ` ${slot.uploadPct}%` : ""}
                    {slot.message ? ` — ${slot.message}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={() => void removeSlot(slot.id)}
                  disabled={busy !== "idle"}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== "idle" || !slots.length}
            onClick={() => void runIngest(slots)}
            className="admin-af-btn rounded-full px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {busy === "read" || busy === "upload" ? "Lecture…" : "Lire et remplir"}
          </button>
          {reading ? (
            <button
              type="button"
              onClick={abortWork}
              className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
            >
              <X className="h-3.5 w-3.5" /> Annuler
            </button>
          ) : null}
          {failedSlots.length && busy === "idle" ? (
            <button
              type="button"
              onClick={() =>
                void runIngest(
                  failedSlots,
                  new Set(failedSlots.map((slot) => slot.file.name))
                )
              }
              className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Réessayer les erreurs ({failedSlots.length})
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== "idle" || Boolean(extract)}
            onClick={startManual}
            className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Saisir les cartes à la main
          </button>
        </div>
      </div>

      {warnings.length ? (
        <div className="space-y-2">
          {warnings.map((warning) => (
            <p
              key={`${warning.file}-${warning.message}`}
              className="rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]"
            >
              {warning.file} — {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      {extract ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
            <CheckCircle2 className="h-4 w-4" />
            Relisez chaque carte. Enregistrer crée un brouillon invisible au client.
          </p>
          {needsReview ? (
            <p className="rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
              À vérifier — lecture incomplète ou aucune carte extraite. Les fichiers restent joints.
            </p>
          ) : null}
          {extract.document_status === "quote" ? (
            <p className="rounded-2xl bg-[#efebe0] px-3 py-2 text-sm text-[var(--admin-navy)]">
              Devis : le client ne verra ce dossier qu’après publication. Saisissez le prix vendu, pas le net PDF.
            </p>
          ) : null}
          {extract.document_status === "identity" ? (
            <p className="rounded-2xl bg-[#efebe0] px-3 py-2 text-sm text-[var(--admin-navy)]">
              Passeport ou pièce d’identité — à classer dans le profil, pas en réservation.
            </p>
          ) : null}
          {role === "admin" && mode === "create" ? (
            <Field label="Client">
              <select
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className={fieldControlClass}
              >
                <option value="">Choisir…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerFullName(c)} — {c.email}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre">
              <input
                value={extract.title || ""}
                onChange={(e) => patch("title", e.target.value)}
                className={fieldControlClass}
              />
            </Field>
            <Field label="Destination">
              <input
                value={extract.destination || ""}
                onChange={(e) => patch("destination", e.target.value)}
                className={fieldControlClass}
              />
            </Field>
            <Field label="Début">
              <DateFrInput
                value={(extract.start_date || "").slice(0, 10)}
                onChange={(value) => patch("start_date", value)}
              />
            </Field>
            <Field label="Fin">
              <DateFrInput
                value={(extract.end_date || "").slice(0, 10)}
                onChange={(value) => patch("end_date", value)}
              />
            </Field>
            <Field label="Prix vendu (total)">
              <MoneyInput
                value={extract.total_amount}
                onChange={(total_amount) => patch("total_amount", total_amount)}
                aria-label="Prix vendu"
              />
            </Field>
            <Field label="Devise">
              <input
                value={extract.currency || "EUR"}
                onChange={(e) => patch("currency", e.target.value)}
                className={fieldControlClass}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display font-bold text-[var(--admin-navy)]">Cartes du carnet</p>
              <div className="flex flex-wrap items-center gap-2">
                {sources.length > 1 ? (
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    className={`${fieldControlClass} w-auto min-w-[10rem] py-1.5`}
                  >
                    <option value="all">Tous les fichiers</option>
                    {sources.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold"
                  onClick={() => patch("items", [...extract.items, emptyItem()])}
                >
                  <Plus className="h-3.5 w-3.5" /> Carte manuelle
                </button>
              </div>
            </div>
            {visibleItems.map((item) => {
              const index = extract.items.indexOf(item);
              return (
                <div
                  key={`${item.details?.source_file_name || "item"}-${index}`}
                  className="flex gap-2"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    const from = dragItem.current;
                    dragItem.current = null;
                    if (from == null || from === index) return;
                    const items = [...extract.items];
                    const [row] = items.splice(from, 1);
                    items.splice(index, 0, row);
                    patch("items", items);
                  }}
                >
                  <span
                    draggable
                    onDragStart={() => {
                      dragItem.current = index;
                    }}
                    className="mt-3 cursor-grab touch-none text-muted"
                    aria-label="Réordonner"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <IngestItemCard
                      item={item}
                      onChange={(next) => patchItem(index, next)}
                      onRemove={() => patch("items", extract.items.filter((_, i) => i !== index))}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-display font-bold text-[var(--admin-navy)]">Voyageurs</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold"
                onClick={() => patch("travelers", [...extract.travelers, { first_name: "", last_name: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            {extract.travelers.map((traveler, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Prénom"
                  value={traveler.first_name || ""}
                  onChange={(e) => {
                    const travelers = [...extract.travelers];
                    travelers[index] = { ...traveler, first_name: e.target.value };
                    patch("travelers", travelers);
                  }}
                  className={fieldControlClass}
                />
                <div className="flex gap-2">
                  <input
                    placeholder="Nom"
                    value={traveler.last_name || ""}
                    onChange={(e) => {
                      const travelers = [...extract.travelers];
                      travelers[index] = { ...traveler, last_name: e.target.value };
                      patch("travelers", travelers);
                    }}
                    className={fieldControlClass}
                  />
                  <button
                    type="button"
                    className="text-accent"
                    onClick={() => patch("travelers", extract.travelers.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={busy !== "idle" || extract.document_status === "identity"}
            onClick={() => void save()}
            className="admin-af-btn rounded-full px-5 py-2.5 text-sm"
          >
            {busy === "save"
              ? "Enregistrement…"
              : mode === "append"
                ? "Enregistrer le brouillon"
                : "Créer le dossier (brouillon)"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-accent">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
