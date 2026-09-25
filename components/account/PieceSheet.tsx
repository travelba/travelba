"use client";

import { useState, type ReactNode } from "react";
import { fileHref } from "@/components/crm/FileOpen";
import { sharePiece } from "@/lib/native/share-piece";

function absoluteFileUrl(path: string) {
  return new URL(fileHref(path), window.location.origin).toString();
}

function isImage(name: string) {
  return /\.(jpe?g|png|webp|gif|heic)$/i.test(name);
}

export function PieceLink({
  path,
  title,
  className,
  children,
}: {
  path: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const href = fileHref(path);
  const image = isImage(title);

  async function onShare() {
    const result = await sharePiece({ url: absoluteFileUrl(path), title });
    if (result === "download") {
      const a = document.createElement("a");
      a.href = href;
      a.download = title;
      a.rel = "noopener";
      a.click();
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B192C]/50 p-3 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white text-[var(--admin-navy)] shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e5e3dc] px-4 py-3">
              <p className="truncate text-sm font-semibold">{title}</p>
              <button type="button" className="text-xs font-semibold" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
            <div className="bg-[#0B192C]">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={href} alt="" className="mx-auto max-h-72 w-full object-contain" />
              ) : (
                <iframe title={title} src={href} className="h-72 w-full bg-white" />
              )}
            </div>
            <div className="flex gap-2 p-3">
              <a
                href={href}
                download={title}
                className="flex-1 rounded-full bg-[#efebe0] px-3 py-2 text-center text-xs font-bold uppercase tracking-wide"
              >
                Télécharger
              </a>
              <button
                type="button"
                onClick={() => void onShare()}
                className="flex-1 rounded-full bg-[#0B192C] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#C5A880]"
              >
                Partager
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
