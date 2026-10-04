"use client";

import { useEffect } from "react";
import { pliantWidgetEvent } from "@/lib/crm/pliant-pci";

const PCI_ORIGINS = new Set(["https://pci-api.getpliant.com", "https://pci-sandbox.partner-api.getpliant.com"]);

/** Le numéro reste dans le cadre Pliant. Il n’entre pas dans la page. */
export function PliantCardFrame({
  src,
  frameId,
  onClear,
  onFail,
}: {
  src: string;
  frameId: string;
  onClear: () => void;
  onFail: () => void;
}) {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!PCI_ORIGINS.has(event.origin)) return;
      const message = pliantWidgetEvent(event.data);
      if (!message || message.frameId !== frameId) return;
      if (message.eventType === "CARD_DATA_CLEARED") onClear();
      if (message.eventType === "CARD_DATA_LOADING_FAILED") onFail();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameId, onClear, onFail]);

  return (
    <iframe
      title="Carte hôtel"
      src={src}
      className="h-72 w-full rounded-2xl border border-[#e5e3dc] bg-white"
      allow="clipboard-read; clipboard-write"
    />
  );
}
