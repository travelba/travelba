"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  MtripGuideDocument,
  PassportFileAttachment,
} from "@/lib/mtrip/guide-types";

export type VoyageFile = MtripGuideDocument | PassportFileAttachment;

type Props = {
  guideId: string;
  files: VoyageFile[];
  title?: string;
  emptyHint?: string;
  /** Ouvrir automatiquement ce fichier (ex. depuis une ligne devis) */
  focusFileId?: string | null;
  onFocusConsumed?: () => void;
  /** Après suppression réussie (guide à jour côté API) */
  onDeleted?: (guide: unknown, fileId: string) => void;
};

function isPdf(mime?: string, name?: string) {
  return (
    (mime || "").includes("pdf") ||
    Boolean(name && /\.pdf$/i.test(name))
  );
}

function isImage(mime?: string, name?: string) {
  return (
    (mime || "").startsWith("image/") ||
    Boolean(name && /\.(jpe?g|png|webp|gif|heic)$/i.test(name))
  );
}

function kindLabel(file: VoyageFile): string {
  if ("kind" in file && file.kind) {
    if (file.kind === "flight") return "Vol";
    if (file.kind === "hotel") return "Hôtel";
    if (file.kind === "other") return "Autre";
  }
  if (!("kind" in file)) return "Passeport";
  return "Doc";
}

function formatSize(n?: number) {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function VoyageFilesPanel({
  guideId,
  files,
  title = "Documents du dossier",
  emptyHint,
  focusFileId,
  onFocusConsumed,
  onDeleted,
}: Props) {
  const [preview, setPreview] = useState<{
    file: VoyageFile;
    url: string;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  const openPreview = useCallback(
    async (file: VoyageFile) => {
      setError(null);
      setLoadingId(file.id);
      try {
        const res = await fetch(
          `/api/admin/mtrip/guides/${guideId}/files/${file.id}`
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Aperçu impossible");
          return;
        }
        setPreview({ file, url: data.url as string });
        if (isImage(file.mime_type, file.file_name)) {
          setThumbUrls((prev) => ({ ...prev, [file.id]: data.url as string }));
        }
      } catch {
        setError("Aperçu impossible");
      } finally {
        setLoadingId(null);
      }
    },
    [guideId]
  );

  const deleteFile = useCallback(
    async (file: VoyageFile) => {
      if (
        !window.confirm(
          `Supprimer « ${file.file_name} » du dossier ?`
        )
      ) {
        return;
      }
      setError(null);
      setDeletingId(file.id);
      try {
        const res = await fetch(
          `/api/admin/mtrip/guides/${guideId}/files/${file.id}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Suppression impossible");
          return;
        }
        setPreview((prev) => (prev?.file.id === file.id ? null : prev));
        setThumbUrls((prev) => {
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
        onDeleted?.(data.guide, file.id);
      } catch {
        setError("Suppression impossible");
      } finally {
        setDeletingId(null);
      }
    },
    [guideId, onDeleted]
  );

  useEffect(() => {
    if (!focusFileId) return;
    const file = files.find((f) => f.id === focusFileId);
    if (file) void openPreview(file);
    onFocusConsumed?.();
  }, [focusFileId, files, openPreview, onFocusConsumed]);

  // Miniatures images (lazy, au montage)
  useEffect(() => {
    let cancelled = false;
    const images = files.filter((f) => isImage(f.mime_type, f.file_name));
    (async () => {
      for (const file of images.slice(0, 12)) {
        if (cancelled || thumbUrls[file.id]) continue;
        try {
          const res = await fetch(
            `/api/admin/mtrip/guides/${guideId}/files/${file.id}`
          );
          const data = await res.json();
          if (res.ok && data.url && !cancelled) {
            setThumbUrls((prev) => ({ ...prev, [file.id]: data.url as string }));
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- thumbs once per file set
  }, [guideId, files.map((f) => f.id).join(",")]);

  if (!files.length) {
    if (!emptyHint) return null;
    return (
      <p className="text-center text-[11px] text-muted">{emptyHint}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium tracking-tight text-[var(--admin-navy)]">
          {title}
          <span className="ml-2 text-xs font-normal text-muted">
            {files.length}
          </span>
        </h3>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => {
          const thumb = thumbUrls[file.id];
          const pdf = isPdf(file.mime_type, file.file_name);
          const img = isImage(file.mime_type, file.file_name);
          const busy = loadingId === file.id || deletingId === file.id;
          return (
            <li key={file.id} className="relative">
              <button
                type="button"
                onClick={() => void openPreview(file)}
                disabled={busy}
                className="group flex w-full overflow-hidden rounded-xl border border-border/70 bg-white/[0.03] text-left transition hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
              >
                <div className="relative h-20 w-16 shrink-0 overflow-hidden border-r border-border/50 bg-[var(--admin-navy)]/10">
                  {img && thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {pdf ? "PDF" : img ? "IMG" : "DOC"}
                      </span>
                    </div>
                  )}
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white">
                      …
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 px-3 py-2 pr-10">
                  <p className="truncate text-xs font-medium text-[var(--admin-navy)] group-hover:text-accent">
                    {file.file_name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {kindLabel(file)}
                    {formatSize(file.size) ? ` · ${formatSize(file.size)}` : ""}
                  </p>
                  <p className="mt-1 text-[10px] text-accent/80 opacity-0 transition group-hover:opacity-100">
                    Aperçu →
                  </p>
                </div>
              </button>
              <button
                type="button"
                title="Supprimer la pièce jointe"
                aria-label={`Supprimer ${file.file_name}`}
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void deleteFile(file);
                }}
                className="absolute right-2 top-2 rounded-md border border-border/60 bg-[var(--admin-surface,#0f1419)]/90 px-1.5 py-0.5 text-[11px] text-muted transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Aperçu ${preview.file.file_name}`}
          onClick={() => setPreview(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreview(null);
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-[var(--admin-surface,#0f1419)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {preview.file.file_name}
                </p>
                <p className="text-[11px] text-muted">
                  {kindLabel(preview.file)} · enregistré dans le dossier
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent/50"
                >
                  Ouvrir
                </a>
                <button
                  type="button"
                  disabled={deletingId === preview.file.id}
                  onClick={() => void deleteFile(preview.file)}
                  className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:border-red-400/70 disabled:opacity-50"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent/50"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-black/20">
              {isImage(preview.file.mime_type, preview.file.file_name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.file.file_name}
                  className="mx-auto max-h-[80vh] w-auto object-contain"
                />
              ) : (
                <iframe
                  title={preview.file.file_name}
                  src={preview.url}
                  className="h-[80vh] w-full border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
