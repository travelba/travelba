"use client";

import { useState } from "react";

export function ReferralShare({ code, link, text, whatsapp }: { code: string; link: string; text: string; whatsapp: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <h2 className="text-sm font-semibold text-[var(--admin-navy)]">Parrainer</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Votre code <span className="font-semibold text-[var(--admin-navy)]">{code}</span>. La personne dépose une demande, que l’agence relit.
      </p>
      <p className="mt-2 break-all text-sm">{link}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className="rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold">
          {copied ? "Lien copié" : "Copier le lien"}
        </button>
        <a href={whatsapp} className="rounded-full bg-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-white" target="_blank" rel="noreferrer">
          Partager par WhatsApp
        </a>
      </div>
      <p className="sr-only">{text}</p>
    </section>
  );
}
