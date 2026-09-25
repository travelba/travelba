"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fileDownloadHref, fileInlineHref } from "@/lib/crm/file-href";
import { isPreviewImage, isPreviewPdf, type FilePreviewModel } from "@/lib/crm/preview-files";
import { siteConfig } from "@/lib/site";
import { Icon } from "@/components/crm/icons";

function whatsappHref(text: string) {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

export function FilePreviewTile({ file }: { file: FilePreviewModel }) {
  const [open, setOpen] = useState(false);
  const image = isPreviewImage(file.mimeType, file.fileName);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-[7.25rem] shrink-0 flex-col gap-1.5 text-left"
        aria-label={`Aperçu de ${file.label}`}
      >
        <span className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl bg-[#0B192C] ring-1 ring-[#C5A880]/50">
          {image && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileInlineHref(file.path)}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Icon
              name={isPreviewPdf(file.mimeType, file.fileName) ? "picture_as_pdf" : image ? "photo" : "draft"}
              className="h-12 w-12 text-[#C5A880]"
            />
          )}
        </span>
        <span className="line-clamp-2 text-center text-xs font-semibold leading-snug text-[#0B192C]">
          {file.label}
        </span>
      </button>
      {open ? <FilePreviewDialog file={file} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function FilePreviewGrid({ files }: { files: FilePreviewModel[] }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((file) => (
        <li key={file.id}>
          <FilePreviewTile file={file} />
        </li>
      ))}
    </ul>
  );
}

function FilePreviewDialog({
  file,
  onClose,
}: {
  file: FilePreviewModel;
  onClose: () => void;
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const image = isPreviewImage(file.mimeType, file.fileName);
  const pdf = isPreviewPdf(file.mimeType, file.fileName);
  const href = fileInlineHref(file.path);
  const downloadHref = fileDownloadHref(file.path, file.fileName);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function share() {
    setSharing(true);
    setNotice(null);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("read");
      const blob = await response.blob();
      const shared = new File([blob], file.fileName || "document", {
        type: blob.type || file.mimeType || "application/octet-stream",
      });
      if (navigator.canShare?.({ files: [shared] })) {
        await navigator.share({ files: [shared], text: file.shareText, title: file.label });
        return;
      }
      window.open(whatsappHref(file.shareText), "_blank", "noopener,noreferrer");
      setNotice("WhatsApp s’ouvre avec le message. Joignez le fichier téléchargé si la pièce n’est pas attachée.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("Le partage n’a pas abouti. Téléchargez la pièce, puis envoyez-la sur WhatsApp.");
    } finally {
      setSharing(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0B192C]/55 p-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5e3dc] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Aperçu</p>
            <h2 id={titleId} className="truncate font-display text-lg font-bold text-[#0B192C]">
              {file.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-[#0B192C]"
            aria-label="Fermer l’aperçu"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#0B192C]/5 p-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={href}
              alt=""
              referrerPolicy="no-referrer"
              className="mx-auto max-h-[58vh] w-full rounded-2xl object-contain"
            />
          ) : pdf ? (
            <iframe title={file.label} src={href} className="h-[58vh] w-full rounded-2xl bg-white" />
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl bg-[#0B192C] text-[#C5A880]">
              <Icon name="draft" className="h-14 w-14" />
              <p className="px-6 text-center text-sm text-white">
                Aperçu indisponible pour ce format. Vous pouvez le télécharger.
              </p>
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-[#e5e3dc] px-4 py-3">
          {notice ? <p className="text-sm text-[#0B192C]">{notice}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={downloadHref}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#C5A880] text-sm font-semibold text-[#0B192C]"
            >
              <Icon name="download" className="h-4 w-4" />
              Télécharger
            </a>
            <button
              type="button"
              disabled={sharing}
              onClick={() => void share()}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#0B192C] text-sm font-semibold text-[#C5A880] disabled:opacity-60"
            >
              <Icon name="share" className="h-4 w-4" />
              {sharing ? "Partage…" : "Partager sur WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
