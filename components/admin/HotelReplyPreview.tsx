"use client";

import { useEffect, useRef, useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { HotelReplyToastStack } from "@/components/admin/HotelReplyToasts";
import { Icon } from "@/components/crm/icons";
import type { HotelReplyNotice } from "@/lib/crm/hotel-reply-notice";

const BOOKING = "00000000-0000-4000-8000-0000000000a1";
const ITEM = "00000000-0000-4000-8000-0000000000b2";

const SAMPLES: HotelReplyNotice[] = [
  {
    id: "apercu-lien",
    bookingId: BOOKING,
    itemId: ITEM,
    hotel: "Villa Serena",
    excerpt: "Le lien d’autorisation est prêt pour la suite avec terrasse.",
    receivedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    href: `/admin/reservations/${BOOKING}?hotel=${ITEM}`,
  },
  {
    id: "apercu-transfert",
    bookingId: BOOKING,
    itemId: ITEM,
    hotel: "Villa Serena",
    excerpt: "Le transfert depuis l’aéroport est confirmé.",
    receivedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    href: `/admin/reservations/${BOOKING}?hotel=${ITEM}`,
  },
];

export function HotelReplyPreview() {
  const [queue, setQueue] = useState(SAMPLES);
  const [openId, setOpenId] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const opened = SAMPLES.find((notice) => notice.id === openId) || null;

  useEffect(() => {
    if (!opened) return;
    document.getElementById("hotel-desk-apercu")?.scrollIntoView({ block: "center" });
    messageRef.current?.focus();
  }, [opened]);
  const visible = queue.slice(0, 4);

  function reveal(notice: HotelReplyNotice) {
    setOpenId(notice.id);
  }

  return (
    <div className="admin-af min-h-screen bg-[#faf9f6] text-[#0B192C]">
      <header className="flex items-center justify-between bg-[#0B192C] px-5 py-4 text-white">
        <span className="flex items-center gap-3">
          <AgencyLogo className="h-9 w-9" />
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">Travel Business</span>
            <span className="text-sm">Espace agence</span>
          </span>
        </span>
        <span className="rounded-full border border-[#C5A880]/50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">
          Aperçu
        </span>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">Fermé en production</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em]">Quand l’hôtel répond</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#3d4654]">
          Elle reste affichée jusqu’à la croix. Le bouton à droite ouvre le message.
        </p>
        <article className="mt-6 overflow-hidden rounded-3xl border border-[#e5e0d4] bg-white shadow-[0_8px_30px_rgba(11,25,44,0.05)]">
          <div className="flex items-start gap-3 px-4 py-4">
            <Icon name="hotel" className="mt-0.5 h-4 w-4 text-[#0B192C]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Villa Serena</p>
              <p className="text-xs text-[#3d4654]">Rome · suite avec terrasse</p>
              {opened ? (
                <div id="hotel-desk-apercu" className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-[#e5e0d4] border-l-4 border-l-[#C5A880] bg-[#faf9f6] px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f552c]">
                      Hôtel · Réponse
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{opened.excerpt}</p>
                  </div>
                  <form
                    className="space-y-2 rounded-2xl border border-[#e5e0d4] bg-white px-3 py-3"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <label className="block text-xs font-semibold">
                      Message
                      <textarea
                        ref={messageRef}
                        className="mt-1 min-h-28 w-full rounded-xl border border-[#d9d1c3] px-3 py-2.5 text-sm outline-none focus:border-[#0B192C]"
                        placeholder="Répondre à l’hôtel"
                        aria-label="Message pour l’hôtel"
                      />
                    </label>
                    <p className="text-xs text-[#3d4654]">Dans l’admin, le message part pour ce séjour.</p>
                    <button type="button" disabled className="rounded-full bg-[#0B192C] px-3 py-2 text-sm text-[#faf9f6] opacity-70">
                      Envoyer
                    </button>
                  </form>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#3d4654]">Le bouton à droite de la notification ouvre cet endroit.</p>
              )}
            </div>
          </div>
        </article>
      </main>
      <HotelReplyToastStack
        notices={visible}
        waiting={Math.max(0, queue.length - visible.length)}
        onOpen={reveal}
        onDismiss={(id) => setQueue((current) => current.filter((row) => row.id !== id))}
      />
    </div>
  );
}
