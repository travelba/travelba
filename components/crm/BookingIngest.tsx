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
import { bookingTotalFromItems } from "@/lib/crm/bookings";
import {
  passengersFromDetails,
  peopleNotOnStay,
  uniquePeople,
} from "@/lib/crm/document-passengers";
import type { PersonName } from "@/lib/crm/person-match";
import { sortItemsByOrder } from "@/lib/crm/carnet";
import { formatMoney } from "@/lib/crm/money";
import { customerFullName, type CrmCompanion, type CrmCustomer } from "@/lib/crm/types";
import { DateFrInput, Field, fieldControlClass } from "@/components/crm/fields";
import { IssuesList } from "@/components/crm/IssuesList";
import {
  collectExtractIssues,
  issuesFromResponse,
  type BookingIssue,
} from "@/lib/crm/booking-issues";
import {
  companionKey,
  householdMembers,
  holderKey,
  linkExtractTravelers,
  travelerIsLinked,
  travelerNeedsHousehold,
  type HouseholdMember,
} from "@/lib/crm/household";
import {
  emptyBookingExtract,
  MAX_INGEST_BYTES,
  MAX_INGEST_FILES,
  sanitizeExtractedPrices,
  type BookingExtract,
  type IngestStreamEvent,
  type IngestWarning,
} from "@/lib/crm/ingest-types";
import { mergeExtractItems } from "@/lib/crm/item-match";
import { IngestItemCard } from "@/components/crm/IngestItemCard";

const EMPTY_COMPANIONS: CrmCompanion[] = [];

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
    include_in_ledger: false,
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
  return sanitizeExtractedPrices({
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
}

export function BookingIngest({
  role,
  mode,
  customers = [],
  householdHolder = null,
  householdCompanions = EMPTY_COMPANIONS,
  ingestUrl,
  saveUrl,
  aiConfigured,
  redirectTo,
}: {
  role: "admin" | "client";
  mode: "create" | "append";
  customers?: CrmCustomer[];
  householdHolder?: Pick<CrmCustomer, "first_name" | "last_name"> & { birth_date?: string | null } | null;
  householdCompanions?: CrmCompanion[];
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
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const [fetchedCompanions, setFetchedCompanions] = useState<CrmCompanion[]>([]);
  const [warnings, setWarnings] = useState<IngestWarning[]>([]);
  const [extract, setExtract] = useState<BookingExtract | null>(null);
  const [seenInDocuments, setSeenInDocuments] = useState<PersonName[]>([]);
  const [customerId, setCustomerId] = useState("");
  const selectedCustomer = customers.find((row) => row.id === customerId) || null;
  const holder = householdHolder || selectedCustomer;
  const companions = householdCompanions.length ? householdCompanions : fetchedCompanions;
  const household: HouseholdMember[] = holder ? householdMembers(holder, companions) : [];
  const documentChoices = peopleNotOnStay(seenInDocuments, extract?.travelers || []);

  useEffect(() => {
    if (mode !== "create" || !customerId) {
      if (mode === "create") setFetchedCompanions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/companions?customer_id=${encodeURIComponent(customerId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setFetchedCompanions(json.companions || []);
      })
      .catch(() => {
        if (!cancelled) setFetchedCompanions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, mode]);

  useEffect(() => {
    if (!holder) return;
    setExtract((prev) =>
      prev ? { ...prev, travelers: linkExtractTravelers(prev.travelers, holder, companions) } : prev
    );
  }, [holder, companions]);
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
          const incomingPeople = uniquePeople([
            ...(event.extract.travelers || []),
            ...(event.extract.items || []).flatMap((item) =>
              passengersFromDetails(item.details as Record<string, unknown> | null)
            ),
          ]);
          setSeenInDocuments((prev) => uniquePeople([...prev, ...incomingPeople]));
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
    const blockers = collectExtractIssues(extract, {
      customerId,
      requireCustomer: role === "admin" && mode === "create",
    });
    if (blockers.length) {
      setIssues(blockers);
      setError(null);
      return;
    }
    setBusy("save");
    setError(null);
    setIssues([]);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const uploaded = await uploadSlots(slots, controller.signal);
      const body = new FormData();
      body.set(
        "extract",
        JSON.stringify({
          ...extract,
          total_amount: bookingTotalFromItems(extract.items || []),
        })
      );
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
      if (!res.ok) {
        const next = issuesFromResponse(json);
        setIssues(next);
        throw new Error(json.error || "Enregistrement impossible");
      }
      setExtract(null);
      setSeenInDocuments([]);
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
            <Field
              label="Montant du séjour"
              hint="Somme des prix vendus de chaque carte. Saisissez le prix sur la carte, pas ici."
            >
              <p className={`${fieldControlClass} bg-[#f7f6f2] font-semibold text-[var(--admin-navy)]`}>
                {formatMoney(bookingTotalFromItems(extract.items || []), extract.currency || "EUR")}
              </p>
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
                      household={household}
                      onChange={(next) => patchItem(index, next)}
                      onRemove={() => patch("items", extract.items.filter((_, i) => i !== index))}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display font-bold text-[var(--admin-navy)]">Voyageurs</p>
              {household.length || documentChoices.length ? (
                <select
                  className={`${fieldControlClass} max-w-[16rem]`}
                  value=""
                  onChange={(event) => {
                    const key = event.target.value;
                    if (key.startsWith("doc:")) {
                      const person = documentChoices[Number(key.slice(4))];
                      if (!person) return;
                      patch("travelers", [
                        ...extract.travelers,
                        { first_name: person.first_name, last_name: person.last_name },
                      ]);
                      return;
                    }
                    const person = household.find((row) => row.key === key);
                    if (!person) return;
                    patch("travelers", [
                      ...extract.travelers,
                      {
                        first_name: person.first_name,
                        last_name: person.last_name,
                        companion_id: person.companion_id,
                        is_account_holder: person.is_account_holder,
                      },
                    ]);
                  }}
                >
                  <option value="">Ajouter…</option>
                  {documentChoices.length ? (
                    <optgroup label="Dans les documents">
                      {documentChoices.map((person, index) => (
                        <option key={`doc-${person.first_name}-${person.last_name}`} value={`doc:${index}`}>
                          {[person.first_name, person.last_name].filter(Boolean).join(" ")}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {household.length ? (
                    <optgroup label="Foyer">
                      {household.map((person) => (
                        <option key={person.key} value={person.key}>
                          {person.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              ) : (
                <p className="text-xs text-muted">Choisissez un client pour voir le foyer.</p>
              )}
            </div>
            {extract.travelers.map((traveler, index) => {
              const linked = travelerIsLinked(traveler);
              const unknown = travelerNeedsHousehold(traveler);
              const selected = traveler.is_account_holder
                ? holderKey()
                : traveler.companion_id
                  ? companionKey(traveler.companion_id)
                  : "";
              return (
                <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <p className="min-w-[10rem] flex-1 text-sm font-medium">
                    {[traveler.first_name, traveler.last_name].filter(Boolean).join(" ") || "Sans nom"}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      linked ? "bg-[var(--admin-sky)]" : "bg-[var(--admin-peach)]"
                    }`}
                  >
                    {traveler.is_account_holder ? "Titulaire" : linked ? "Foyer" : unknown ? "Document" : "Placeholder"}
                  </span>
                  <select
                    className={`${fieldControlClass} max-w-[14rem]`}
                    value={selected}
                    onChange={(event) => {
                      const person = household.find((row) => row.key === event.target.value);
                      const travelers = [...extract.travelers];
                      travelers[index] = person
                        ? {
                            first_name: person.first_name,
                            last_name: person.last_name,
                            companion_id: person.companion_id,
                            is_account_holder: person.is_account_holder,
                          }
                        : { ...traveler, companion_id: null, is_account_holder: false };
                      patch("travelers", travelers);
                    }}
                  >
                    <option value="">{household.length ? "Rattacher…" : "Choisissez un client"}</option>
                    {household.map((person) => (
                      <option key={person.key} value={person.key}>
                        {person.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-accent"
                    onClick={() => patch("travelers", extract.travelers.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
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

      <IssuesList issues={issues} />
      {error && !issues.length ? (
        <p className="flex items-start gap-2 text-sm text-accent">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
