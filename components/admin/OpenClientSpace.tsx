"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { adminAction } from "@/lib/crm/admin-action";
import { useIsClient } from "@/lib/crm/use-is-client";

/**
 * « Ouvrir l’espace client » : le même lien desk pour la fiche et le menu du dossier.
 * 10 minutes, une ouverture, rien n’est envoyé au client.
 */
export function useOpenClientSpace(customerId: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const request = useRef(0);

  async function start() {
    if (busy) return;
    const ticket = request.current + 1;
    request.current = ticket;
    setOpen(true);
    setBusy(true);
    setUrl(null);
    setError(null);
    setCopied(false);
    const result = await adminAction<{ url?: string }>(`/api/admin/clients/${customerId}/ouvrir`, {
      method: "POST",
    });
    if (ticket !== request.current) return;
    setBusy(false);
    if (!result.ok || typeof result.data?.url !== "string") {
      setUrl(null);
      setError(result.error || "Lien indisponible. Réessayez.");
      return;
    }
    setUrl(result.data.url);
    router.refresh();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  const dialog = (
    <ClientSpaceDialog
      open={open}
      busy={busy}
      url={url}
      error={error}
      copied={copied}
      onClose={close}
      onCopy={() => void copy()}
    />
  );

  return { start, dialog, busy };
}

/** Bouton de la fiche. Le menu du dossier appelle le même hook, le dialogue reste monté. */
export function OpenClientSpace({ customerId }: { customerId: string }) {
  const space = useOpenClientSpace(customerId);
  return (
    <>
      <button
        type="button"
        onClick={() => void space.start()}
        disabled={space.busy}
        className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline disabled:opacity-60"
      >
        {space.busy ? "Préparation…" : "Ouvrir l’espace client"}
      </button>
      {space.dialog}
    </>
  );
}

function ClientSpaceDialog({
  open,
  busy,
  url,
  error,
  copied,
  onClose,
  onCopy,
}: {
  open: boolean;
  busy: boolean;
  url: string | null;
  error: string | null;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mounted = useIsClient();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => closeRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focus);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-[#e8e4dc] bg-white text-[#1a1c1a] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#faf9f6] px-5 py-4">
          <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
            Ouvrir l’espace client
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {busy ? <BusyBar label="Préparation du lien…" /> : null}
          {url ? (
            <div className="rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
              <p className="font-semibold">Lien d’ouverture prêt : 10 minutes, une seule ouverture.</p>
              <p className="mt-1">
                Ouvrez-le dans une fenêtre privée ou sur le téléphone du client : ce navigateur reste connecté à
                l’agence. L’ouverture est enregistrée à votre nom dans l’historique du client. Rien n’est envoyé au client.
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--admin-red)]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              ref={closeRef}
              type="button"
              disabled={busy}
              onClick={onClose}
              className="admin-tap inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)] disabled:opacity-50"
            >
              Fermer
            </button>
            {url ? (
              <button
                type="button"
                onClick={onCopy}
                className="admin-tap inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
              >
                {copied ? "Lien copié" : "Copier le lien"}
              </button>
            ) : null}
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="admin-tap inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-[#faf9f6]"
              >
                Ouvrir dans un onglet
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
