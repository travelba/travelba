"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  BOOKING_ITEM_KINDS,
  BOOKING_ITEM_LABELS,
  customerFullName,
  type BookingItemKind,
  type CrmCustomer,
} from "@/lib/crm/types";
import { DateFrInput, Field, fieldControlClass } from "@/components/crm/fields";
import type { BookingExtract } from "@/lib/crm/ingest-types";

type ItemDraft = BookingExtract["items"][number];
type TravelerDraft = BookingExtract["travelers"][number];

function emptyExtract(): BookingExtract {
  return {
    document_status: null,
    title: "",
    destination: "",
    start_date: "",
    end_date: "",
    currency: "EUR",
    total_amount: 0,
    notes_client: "",
    customer_email: "",
    customer_first_name: "",
    customer_last_name: "",
    items: [],
    travelers: [],
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
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"idle" | "read" | "save">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extract, setExtract] = useState<BookingExtract | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(true);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 8));
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
      setExtract({ ...emptyExtract(), ...json.extract });
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
    body.set("visible_to_client", visibleToClient ? "1" : "0");
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

  if (!aiConfigured) {
    return (
      <div className="admin-af-card rounded-3xl border border-dashed border-border p-5 text-sm text-muted">
        La lecture automatique n’est pas encore configurée. Ajoutez{" "}
        <code className="text-xs">OPENAI_API_KEY</code> pour déposer un billet et remplir le dossier.
      </div>
    );
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
              {mode === "append" ? "Compléter avec un document" : "Créer le dossier depuis les documents"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Déposez billets, vouchers, devis ou factures (PDF ou photo). Nous lisons tout et proposons les champs.
            </p>
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
        <button
          type="button"
          disabled={busy !== "idle" || !files.length}
          onClick={() => void readDocs()}
          className="admin-af-btn mt-4 rounded-full px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {busy === "read" ? "Lecture…" : "Lire et remplir"}
        </button>
      </div>

      {extract ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
            <CheckCircle2 className="h-4 w-4" />
            Vérifiez puis enregistrez. Rien n’est écrit tant que vous n’avez pas validé.
          </p>
          {extract.document_status === "quote" ? (
            <p className="rounded-2xl bg-[#efebe0] px-3 py-2 text-sm text-[var(--admin-navy)]">
              Devis : tarifs non bloqués. Vérifiez la chambre et le prix avant d’enregistrer.
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
            <Field label="Montant">
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
              <p className="font-display font-bold text-[var(--admin-navy)]">Prestations</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold"
                onClick={() =>
                  patch("items", [
                    ...extract.items,
                    {
                      kind: "fee",
                      title: "",
                      supplier: "",
                      confirmation_ref: "",
                      start_at: "",
                      end_at: "",
                      amount: null,
                      details: {},
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            {extract.items.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-6">
                <select
                  value={item.kind}
                  onChange={(e) => patchItem(index, { ...item, kind: e.target.value as BookingItemKind })}
                  className={fieldControlClass}
                >
                  {BOOKING_ITEM_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {BOOKING_ITEM_LABELS[kind]}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Titre"
                  value={item.title}
                  onChange={(e) => patchItem(index, { ...item, title: e.target.value })}
                  className={`${fieldControlClass} sm:col-span-2`}
                />
                <input
                  placeholder="Fournisseur"
                  value={item.supplier || ""}
                  onChange={(e) => patchItem(index, { ...item, supplier: e.target.value })}
                  className={fieldControlClass}
                />
                <input
                  placeholder="PNR / réf."
                  value={item.confirmation_ref || ""}
                  onChange={(e) => patchItem(index, { ...item, confirmation_ref: e.target.value })}
                  className={fieldControlClass}
                />
                <button
                  type="button"
                  className="justify-self-end text-accent"
                  onClick={() => patch("items", extract.items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <input
                  placeholder="Début"
                  value={item.start_at || ""}
                  onChange={(e) => patchItem(index, { ...item, start_at: e.target.value })}
                  className={`${fieldControlClass} sm:col-span-2`}
                />
                <input
                  placeholder="Fin"
                  value={item.end_at || ""}
                  onChange={(e) => patchItem(index, { ...item, end_at: e.target.value })}
                  className={`${fieldControlClass} sm:col-span-2`}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Montant"
                  value={item.amount ?? ""}
                  onChange={(e) =>
                    patchItem(index, { ...item, amount: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className={fieldControlClass}
                />
                {item.kind === "flight" ? (
                  <input
                    placeholder="Vol (AF123)"
                    value={item.details?.flight_number || ""}
                    onChange={(e) =>
                      patchItem(index, {
                        ...item,
                        details: { ...item.details, flight_number: e.target.value },
                      })
                    }
                    className={fieldControlClass}
                  />
                ) : (
                  <span />
                )}
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

          {role === "admin" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={visibleToClient}
                onChange={(e) => setVisibleToClient(e.target.checked)}
              />
              Publier les fichiers dans l’espace client
            </label>
          ) : null}

          <button
            type="button"
            disabled={busy !== "idle" || extract.document_status === "identity"}
            onClick={() => void save()}
            className="admin-af-btn rounded-full px-5 py-2.5 text-sm"
          >
            {busy === "save"
              ? "Enregistrement…"
              : mode === "append"
                ? "Ajouter au dossier"
                : "Créer le dossier"}
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
