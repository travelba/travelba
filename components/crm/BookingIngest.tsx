"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { sortItemsByOrder } from "@/lib/crm/carnet";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";
import { DateFrInput, Field, fieldControlClass } from "@/components/crm/fields";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { IngestItemCard } from "@/components/crm/IngestItemCard";

type ItemDraft = BookingExtract["items"][number];

const MAX_FILES = 30;
const MAX_BYTES = 25 * 1024 * 1024;

function emptyExtract(): BookingExtract {
  return {
    document_status: null,
    title: "",
    destination: "",
    start_date: "",
    end_date: "",
    currency: "EUR",
    total_amount: null,
    notes_client: "",
    customer_email: "",
    customer_first_name: "",
    customer_last_name: "",
    items: [],
    travelers: [],
  };
}

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
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"idle" | "read" | "save">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extract, setExtract] = useState<BookingExtract | null>(null);
  const [customerId, setCustomerId] = useState("");

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((file) => file.size > MAX_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} dépasse 25 Mo.`);
      return;
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
    setError(null);
  }

  async function readDocs() {
    if (!files.length) {
      setError("Ajoutez un PDF ou une photo.");
      return;
    }
    setBusy("read");
    setError(null);
    const body = new FormData();
    for (const file of files) body.append("files", file);
    try {
      const res = await fetch(ingestUrl, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lecture impossible");
      const incoming = { ...emptyExtract(), ...json.extract };
      setExtract({
        ...incoming,
        items: sortItemsByOrder(incoming.items || []),
      });
      if (json.suggested_customer_id) setCustomerId(json.suggested_customer_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture impossible");
    } finally {
      setBusy("idle");
    }
  }

  async function save() {
    if (!extract) return;
    if (role === "admin" && mode === "create" && !customerId) {
      setError("Choisissez un client.");
      return;
    }
    setBusy("save");
    setError(null);
    const body = new FormData();
    body.set("extract", JSON.stringify(extract));
    body.set("customer_id", customerId);
    for (const file of files) body.append("files", file);
    try {
      const res = await fetch(saveUrl, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Enregistrement impossible");
      setExtract(null);
      setFiles([]);
      if (json.booking && redirectTo) {
        router.push(redirectTo(json.booking));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
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

  function startManual() {
    setExtract(emptyExtract());
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
            {busy === "read" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
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
                Lecture automatique indisponible ici. Déposez les fichiers et saisissez les cartes à la main.
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
        {files.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
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
            disabled={busy !== "idle" || !files.length || !aiConfigured}
            onClick={() => void readDocs()}
            className="admin-af-btn rounded-full px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {busy === "read" ? "Lecture…" : "Lire et remplir"}
          </button>
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
              <input
                type="number"
                step="0.01"
                value={extract.total_amount ?? ""}
                onChange={(e) => patch("total_amount", e.target.value === "" ? null : Number(e.target.value))}
                className={fieldControlClass}
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
            <div className="flex items-center justify-between">
              <p className="font-display font-bold text-[var(--admin-navy)]">Cartes du carnet</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold"
                onClick={() => patch("items", [...extract.items, emptyItem()])}
              >
                <Plus className="h-3.5 w-3.5" /> Carte manuelle
              </button>
            </div>
            {extract.items.map((item, index) => (
              <div
                key={index}
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
            ))}
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
