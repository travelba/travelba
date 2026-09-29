"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/crm/icons";
import {
  BOOKING_VUE_KEY,
  BOOKING_VUES,
  DESK_COPY,
  DESK_SECTIONS,
  deskNextSteps,
  deskOpening,
  deskOrder,
  parseBookingVue,
  sectionHint,
  sectionNeedsAttention,
  type BookingVue,
  type DeskFacts,
  type DeskSectionId,
} from "@/lib/crm/booking-desk";

const TILE_ICON: Record<DeskSectionId, string> = {
  aujourd: "task_alt",
  programme: "flight",
  voyageurs: "group",
  formalites: "verified_user",
  hotel: "hotel",
  argent: "account_balance_wallet",
  papiers: "description",
  client: "share",
  dossier: "menu_book",
};

export type DeskIdentity = {
  reference: string;
  title: string;
  destination: string;
  dates: string;
  when: string | null;
  statusLabel: string;
  clientName: string;
  published: boolean;
};

export function useBookingVue(): [BookingVue, (next: BookingVue) => void] {
  const [vue, setVue] = useState<BookingVue>("bureau");
  useEffect(() => {
    const fromUrl = parseBookingVue(new URLSearchParams(window.location.search).get("vue"));
    const stored = parseBookingVue(window.localStorage.getItem(BOOKING_VUE_KEY));
    const next = fromUrl || stored || "bureau";
    setVue(next);
  }, []);
  function choose(next: BookingVue) {
    setVue(next);
    window.localStorage.setItem(BOOKING_VUE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("vue", next);
    window.history.replaceState(null, "", url);
  }
  return [vue, choose];
}

function ChapterHead({
  id,
  index,
  vue,
}: {
  id: DeskSectionId;
  index: number;
  vue: BookingVue;
}) {
  const copy = DESK_COPY[id];
  if (vue === "bureau" && id === "aujourd") {
    return (
      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold text-[var(--admin-navy)]">{copy.title}</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">{copy.lead}</p>
      </div>
    );
  }
  if (vue === "histoire") {
    return (
      <div className="mb-5 border-b border-[var(--admin-gold)]/40 pb-4">
        <p className="font-display text-4xl font-bold leading-none text-[var(--admin-gold)]">
          {String(index + 1).padStart(2, "0")}
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--admin-navy)]">{copy.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{copy.lead}</p>
      </div>
    );
  }
  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{copy.label}</p>
      <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">{copy.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{copy.lead}</p>
    </div>
  );
}
