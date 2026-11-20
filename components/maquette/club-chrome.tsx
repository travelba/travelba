"use client";

import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import { AccountChrome, type AccountChromeLink } from "@/components/account/AccountChrome";
import { AdminNav } from "@/components/admin/AdminNav";
import { HotelPhotoStrip } from "@/components/account/HotelPhotoStrip";
import { BrandMark } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { fieldControlClass } from "@/components/crm/fields";
import type { AdminNavGroup } from "@/lib/crm/admin-nav";
import type { ClubHotel } from "@/lib/crm/club-maquette";

export function ClubBanner() {
  return (
    <div className="bg-[var(--admin-navy)] px-4 py-2 text-center text-[13px] font-semibold text-[var(--admin-gold)]">
      <Link href="/maquette/club">Maquette, données d’exemple</Link>
    </div>
  );
}

const MEMBER_LINKS: AccountChromeLink[] = [
  {
    href: "/maquette/club/sejours",
    label: "Accueil",
    exact: true,
    icon: "explore",
    night: "home",
  },
  {
    href: "/maquette/club/recherche",
    label: "Hôtels",
    icon: "hotel",
    night: "hotel",
    match: [
      "/maquette/club/recherche",
      "/maquette/club/hotel",
      "/maquette/club/tarif",
      "/maquette/club/voyageur",
      "/maquette/club/paiement",
      "/maquette/club/groupe",
    ],
  },
  {
    href: "/maquette/club/sejours/riad-lina",
    label: "Réservations",
    icon: "luggage",
    night: "stay",
    match: ["/maquette/club/sejours/riad-lina", "/maquette/club/confirmation", "/maquette/club/rappel"],
  },
  {
    href: "/maquette/club/cotisation",
    label: "Transactions",
    icon: "receipt_long",
    night: "ledger",
    match: ["/maquette/club/cotisation", "/maquette/club/parrainage"],
  },
  {
    href: "/maquette/club/compte",
    label: "Mon compte",
    icon: "badge",
    night: "account",
    match: ["/maquette/club/compte", "/maquette/club/concierge"],
  },
];

export const CLUB_NAV: AdminNavGroup = {
  id: "club",
  label: "Club",
  title: "Club",
  items: [
    { href: "/admin/maquette-club", label: "Membres", icon: "group" },
    { href: "/admin/maquette-club/inscriptions", label: "Inscriptions", icon: "inbox" },
    { href: "/admin/maquette-club/alertes", label: "Alertes", icon: "chat" },
    { href: "/admin/maquette-club/tableau", label: "Tableau", icon: "explore" },
  ],
};

export function ClubMemberFrame({
  title,
  signedIn = false,
  wide = false,
  children,
}: {
  title: string;
  path: string;
  signedIn?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  if (!signedIn) {
    return (
      <div className="account-app admin-af min-h-screen" data-maquette="club">
        <ClubBanner />
        <div className={`mx-auto px-4 py-8 pb-36 ${wide ? "max-w-3xl" : "max-w-[420px]"}`}>
          <BrandMark href="/maquette/club" subtitle={title} />
          <div className="mt-6 rounded-2xl border border-[var(--border)] border-t-[2px] border-t-[var(--admin-gold)] bg-white p-6 shadow-[0_4px_20px_-2px_rgba(11,25,44,0.04)] sm:p-8">
            {children}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-maquette="club">
      <ClubBanner />
      <AccountChrome
        customerName="Léa Exemplaire"
        initials="LE"
        needsPhone={false}
        preview
        hotels
        links={MEMBER_LINKS}
        previewHome="/maquette/club"
      >
        {children}
      </AccountChrome>
    </div>
  );
}

export function ClubAdminFrame({ title, children }: { title: string; path: string; children: ReactNode }) {
  return (
    <div className="admin-af min-h-screen bg-background text-foreground" data-maquette="club-admin">
      <AdminNav extraGroups={[CLUB_NAV]} preview staffName="Maquette" staffRole="admin">
        <ClubBanner />
        <h1 className="mt-4 font-display text-2xl font-bold text-[var(--admin-navy)]">{title}</h1>
        <p className="mt-1 text-sm text-muted">Maquette. Aucune écriture, aucun prélèvement.</p>
        {children}
      </AdminNav>
    </div>
  );
}

export function ClubField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <input {...props} className={fieldControlClass} />
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function GoldChoice({
  selected,
  title,
  body,
  onPick,
  hotel = false,
  children,
}: {
  selected: boolean;
  title: string;
  body?: string;
  onPick: () => void;
  hotel?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={hotel ? "h-recap flex w-full items-start gap-3 border-2 text-left" : "flex w-full items-start gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left"}
      style={{ borderColor: selected ? "#C5A880" : "#e7e1d6", background: selected ? "#f4efe6" : "#fff" }}
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[10px] border text-[var(--admin-navy)]"
        style={{ borderColor: selected ? "#C5A880" : "rgba(26,26,26,0.3)", background: selected ? "#C5A880" : "#fff" }}
      >
        {selected ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-base font-semibold text-[var(--admin-navy)]">{title}</span>
        {body ? <span className="mt-1 block text-sm leading-relaxed text-muted">{body}</span> : null}
        {children}
      </span>
    </button>
  );
}

export function ClubButton({
  children,
  disabled,
  onClick,
  href,
  variant = "navy",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
  variant?: "navy" | "line";
}) {
  const className =
    variant === "line"
      ? "flex h-12 w-full items-center justify-center rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--admin-navy)]"
      : "admin-af-btn flex h-12 w-full items-center justify-center rounded-full text-sm disabled:opacity-40";
  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function HotelCover({ hotel, title }: { hotel: ClubHotel; title?: string }) {
  return (
    <div className="hotel-theme">
      <div className="h-cover overflow-hidden rounded-xl" style={{ background: hotel.tone }}>
        <HotelPhotoStrip photo={hotel.photo} alt="" eager />
        <div className="h-cover-fade" />
        <div className="h-cover-copy">
          <p className="text-sm text-white/80">{hotel.city}</p>
          <h2 className="h-serif text-[1.2rem] font-semibold leading-tight">{title || hotel.name}</h2>
        </div>
      </div>
    </div>
  );
}
