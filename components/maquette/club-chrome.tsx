"use client";

import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import { BrandMark } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";

export function ClubBanner() {
  return (
    <div className="sticky top-0 z-[80] bg-[#0B192C] px-4 py-2 text-center text-[13px] font-semibold text-[#C5A880]">
      <Link href="/maquette/club">Maquette, données d’exemple</Link>
    </div>
  );
}

const TABS = [
  { href: "/maquette/club/recherche", label: "Recherche", icon: "search", roots: ["/maquette/club/recherche", "/maquette/club/hotel", "/maquette/club/tarif", "/maquette/club/voyageur", "/maquette/club/paiement", "/maquette/club/groupe"] },
  { href: "/maquette/club/sejours", label: "Séjours", icon: "luggage", roots: ["/maquette/club/sejours", "/maquette/club/confirmation", "/maquette/club/rappel"] },
  { href: "/maquette/club/cotisation", label: "Club", icon: "verified", roots: ["/maquette/club/cotisation", "/maquette/club/parrainage", "/maquette/club/concierge"] },
  { href: "/maquette/club/compte", label: "Compte", icon: "badge", roots: ["/maquette/club/compte"] },
] as const;

export function ClubMemberFrame({
  title,
  path,
  signedIn = false,
  wide = false,
  dock,
  children,
}: {
  title: string;
  path: string;
  signedIn?: boolean;
  wide?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="account-app admin-af hotel-theme min-h-screen" data-maquette="club">
      <ClubBanner />
      <header className="sticky top-9 z-40 border-b border-[#e5e3dc] bg-[rgba(250,249,246,0.94)] backdrop-blur-md">
        <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-4 ${wide ? "max-w-3xl" : "max-w-[480px]"}`}>
          <BrandMark href="/maquette/club" subtitle={title} compact />
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--admin-navy)]"
            aria-label="Écrire à l’agence sur WhatsApp"
          >
            <Icon name="chat" className="h-[22px] w-[22px]" />
          </a>
        </div>
      </header>
      <main className={`mx-auto px-4 pb-40 pt-4 ${wide ? "max-w-3xl" : "max-w-[480px]"}`}>{children}</main>
      {dock ? (
        <div
          className="h-dock fixed inset-x-0 z-40"
          style={{ bottom: signedIn ? "calc(3.5rem + env(safe-area-inset-bottom, 0px))" : "0" }}
        >
          <div className={`mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${wide ? "max-w-3xl" : "max-w-[480px]"}`}>
            {dock}
          </div>
        </div>
      ) : null}
      {signedIn ? (
        <nav className="account-tabbar" aria-label="Club Travel BA">
          <div className="mx-auto flex h-14 w-full max-w-[480px] items-stretch px-1">
            {TABS.map((tab) => {
              const active = tab.roots.some((root) => path === root || path.startsWith(`${root}/`));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] leading-none ${
                    active ? "font-bold text-[var(--admin-navy)]" : "font-semibold text-[#1a2740]"
                  }`}
                >
                  <span className={`flex h-7 w-10 items-center justify-center rounded-full ${active ? "bg-[var(--admin-navy)] text-[var(--admin-gold)]" : "text-[var(--admin-navy)]"}`}>
                    <Icon name={tab.icon} className="h-[1.3rem] w-[1.3rem]" filled={active} />
                  </span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

const ADMIN_LINKS = [
  { href: "/admin/maquette-club", label: "Membres", icon: "badge", exact: true },
  { href: "/admin/maquette-club/inscriptions", label: "Inscriptions", icon: "inbox", exact: false },
  { href: "/admin/maquette-club/alertes", label: "Alertes", icon: "chat", exact: false },
  { href: "/admin/maquette-club/tableau", label: "Tableau", icon: "explore", exact: false },
] as const;

export function ClubAdminFrame({
  title,
  path,
  children,
}: {
  title: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-af min-h-screen bg-background text-foreground" data-maquette="club-admin">
      <ClubBanner />
      <aside className="fixed bottom-0 left-0 top-9 z-50 hidden w-72 flex-col bg-[var(--admin-navy)] px-5 py-6 text-white lg:flex">
        <Link href="/admin/maquette-club" className="px-1">
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Travel Business</span>
          <span className="mt-1 block text-sm text-[#dbe5f6]">Club · maquette</span>
        </Link>
        <nav className="mt-8 space-y-1" aria-label="Club">
          {ADMIN_LINKS.map((link) => {
            const active = link.exact ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-white/10 font-semibold text-white" : "text-[#dbe5f6]"}`}
              >
                <Icon name={link.icon} className="h-4 w-4 text-[var(--admin-gold)]" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/maquette/club" className="mt-auto px-3 text-sm text-[var(--admin-gold)]">
          Tous les écrans
        </Link>
      </aside>
      <div className="lg:pl-72">
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
          <h1 className="font-display text-2xl font-bold text-[var(--admin-navy)]">{title}</h1>
          {children}
        </main>
      </div>
      <nav className="account-tabbar lg:hidden" aria-label="Club">
        <div className="mx-auto flex h-14 max-w-lg items-stretch">
          {ADMIN_LINKS.map((link) => {
            const active = link.exact ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center text-[11px] ${active ? "font-bold text-[var(--admin-navy)]" : "text-[#1a2740]"}`}
              >
                <Icon name={link.icon} className="mb-0.5 h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function ClubField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm h-ink">
      {label}
      <input {...props} className="h-field mt-1 h-11 w-full px-3 text-[15px] outline-none" />
    </label>
  );
}

export function GoldChoice({
  selected,
  title,
  body,
  onPick,
  children,
}: {
  selected: boolean;
  title: string;
  body?: string;
  onPick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="h-recap flex w-full items-start gap-3 border-2 text-left"
      style={{ borderColor: selected ? "#C5A880" : "#e7e1d6", background: selected ? "#f4efe6" : "#fff" }}
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[10px] border text-[#0B192C]"
        style={{
          borderColor: selected ? "#C5A880" : "rgba(26,26,26,0.3)",
          background: selected ? "#C5A880" : "#fff",
        }}
      >
        {selected ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="h-serif block text-[1.05rem] font-semibold h-ink">{title}</span>
        {body ? <span className="mt-1 block text-sm leading-relaxed h-muted">{body}</span> : null}
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
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const className = "h-btn flex h-12 w-full items-center justify-center text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
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
