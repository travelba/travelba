"use client";

import { useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";

type Audience = "client" | "staff";

function filenameFrom(header: string | null) {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] || "Releve-de-compte.pdf";
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function StatementRequest({
  endpoint = null,
  audience = "client",
}: {
  endpoint?: string | null;
  audience?: Audience;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"download" | "whatsapp" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPdf() {
    if (!endpoint) return null;
    const response = await fetch(endpoint);
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.includes("pdf")) return null;
    const blob = await response.blob();
    return { blob, filename: filenameFrom(response.headers.get("content-disposition")) };
  }

  async function download() {
    if (!endpoint || busy) return;
    setBusy("download");
    setNotice(null);
    try {
      const file = await loadPdf();
      if (!file) {
        setNotice("Le relevé n’a pas pu être préparé. Réessayez.");
        return;
      }
      saveBlob(file.blob, file.filename);
      setNotice("Relevé téléchargé.");
    } catch {
      setNotice("Le relevé n’a pas pu être préparé. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function shareFile() {
    const file = await loadPdf();
    if (!file || typeof navigator === "undefined" || !navigator.share) return "unavailable" as const;
    const pdf = new File([file.blob], file.filename, { type: "application/pdf" });
    const payload = { files: [pdf], title: "Relevé de compte" };
    if (!navigator.canShare?.(payload)) return "unavailable" as const;
    try {
      await navigator.share(payload);
      return "shared" as const;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled" as const;
      return "unavailable" as const;
    }
  }

  async function sendWhatsapp() {
    if (!endpoint || busy) return;
    setBusy("whatsapp");
    setNotice(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
      if (response.ok && payload?.ok) {
        setNotice(payload.message || "Relevé envoyé sur votre WhatsApp.");
        return;
      }
      if (audience === "client") {
        const shared = await shareFile();
        if (shared === "shared") {
          setNotice("Le relevé est prêt à partir sur WhatsApp.");
          return;
        }
        if (shared === "cancelled") {
          setNotice("Envoi annulé. Le relevé reste à télécharger.");
          return;
        }
      }
      setNotice(payload?.error || "WhatsApp n’a pas pu remettre le relevé. Téléchargez-le.");
    } catch {
      setNotice("WhatsApp n’a pas pu remettre le relevé. Téléchargez-le.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!endpoint) {
            setNotice("Le relevé n’est pas disponible ici.");
            return;
          }
          setOpen((value) => !value);
          setNotice(null);
        }}
        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#e5e3dc] bg-white text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
      >
        <Icon name="picture_as_pdf" className="h-[18px] w-[18px] text-[#9c7c4e]" />
        Demander un relevé
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-xl bg-[#faf9f6] px-3 py-3">
          <p className="text-[13px] text-muted">
            {audience === "staff"
              ? "Le même relevé que dans l’espace du client."
              : "Le relevé reprend votre encours et les mouvements comptabilisés."}
          </p>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void download()}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--admin-navy)] text-[12px] font-semibold uppercase tracking-[0.06em] text-white disabled:opacity-60"
          >
            <Icon name="download" className="h-[18px] w-[18px]" />
            Télécharger le PDF
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void sendWhatsapp()}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#e5e3dc] bg-white text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)] disabled:opacity-60"
          >
            <Icon name="chat" className="h-[18px] w-[18px] text-[#9c7c4e]" />
            {audience === "staff" ? "Envoyer par WhatsApp" : "Recevoir sur WhatsApp"}
          </button>
          <BusyBar
            active={Boolean(busy)}
            label={busy === "whatsapp" ? "Envoi par WhatsApp…" : "Préparation du relevé…"}
          />
          {notice ? <p className="text-[13px] text-[var(--admin-navy)]">{notice}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
