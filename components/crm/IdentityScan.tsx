"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, ScanLine } from "lucide-react";
import type { ExtractedIdentity } from "@/lib/crm/identity";

export type ScanResult = {
  file: File;
  preview: string | null;
  identity: ExtractedIdentity | null;
  warning: string | null;
};

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/") || file.type.includes("svg")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxW = 2000;
    const scale = Math.min(1, maxW / Math.max(bitmap.width, 1));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function IdentityScan({
  endpoint = "/api/client/documents/scan",
  title = "Photographier le passeport ou la pièce d’identité",
  description = "Nous lisons automatiquement nom, prénom, date de naissance, nationalité et n° de document.",
  onResult,
}: {
  endpoint?: string;
  title?: string;
  description?: string;
  onResult: (result: ScanResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const prepared = await compressPhoto(file);
    const preview = prepared.type.startsWith("image/") ? URL.createObjectURL(prepared) : null;
    const body = new FormData();
    body.set("file", prepared);
    try {
      const res = await fetch(endpoint, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lecture impossible");
      onResult({
        file: prepared,
        preview,
        identity: json.identity || null,
        warning: json.warning || null,
      });
    } catch (err) {
      onResult({ file: prepared, preview, identity: null, warning: null });
      setError(err instanceof Error ? err.message : "Lecture impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-dashed border-[var(--admin-gold)]/70 bg-[var(--admin-sky)]/50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {busy ? (
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--admin-navy)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        ) : (
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--admin-navy)]">
            <ScanLine className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-[var(--admin-navy)]">{title}</p>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="admin-af-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm"
        >
          <Camera className="h-4 w-4" />
          {busy ? "Lecture…" : "Choisir une photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFile(file);
          }}
        />
      </div>
      {error ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-accent">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ScanStatus({
  identity,
  warning,
}: {
  identity: ExtractedIdentity | null;
  warning: string | null;
}) {
  if (!identity && !warning) return null;
  if (!identity) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-accent/30 bg-[#fdf0ed] px-3 py-2 text-sm text-accent">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {warning}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#fbf7ec] px-3 py-2 text-sm text-[var(--admin-navy)]">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-navy)]" />
      {warning || "Document lu. Vérifiez les informations, puis enregistrez."}
    </p>
  );
}
