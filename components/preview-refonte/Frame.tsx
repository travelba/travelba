"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { siteConfig } from "@/lib/site";
import { waCopy, whatsappHref } from "./photos";
import { universes } from "./universes";

const HOUSE = [
  { href: "/preview-refonte/espace-client", label: "L’espace" },
  { href: "/connexion", label: "Entrer" },
] as const;

export function Frame({ children }: { children: React.ReactNode; tone?: "overlay" | "solid"; whatsappText?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const solid = scrolled || open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <a className="tba-skip" href="#contenu">
        Aller au contenu
      </a>
      <header className={solid ? "tba-header is-solid" : "tba-header"}>
        <Link href="/preview-refonte" className="tba-logo" onClick={close}>
          <AgencyLogo className="h-9 w-9" />
          <span>
            <small>Travel Business Agency</small>
            Travel BA
          </span>
        </Link>
        <nav className="tba-nav" aria-label="La maison">
          {universes.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.nav}
            </Link>
          ))}
          <Link href="/preview-refonte/espace-client" aria-current={pathname === "/preview-refonte/espace-client" ? "page" : undefined}>
            L’espace
          </Link>
          <Link className="tba-nav-cta" href="/preview-refonte#devis">
            Un devis
          </Link>
        </nav>
        <button type="button" className="tba-menu-btn" aria-expanded={open} aria-controls="tba-menu" onClick={() => setOpen((value) => !value)}>
          {open ? "Fermer" : "Menu"}
        </button>
      </header>
      {open ? (
        <nav id="tba-menu" className="tba-menu" aria-label="Menu">
          <Link href="/preview-refonte" onClick={close}>
            La maison
          </Link>
          {universes.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={close}>
              {item.title}
            </Link>
          ))}
          {HOUSE.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={close}>
              {item.label}
            </Link>
          ))}
          <Link href="/preview-refonte#devis" onClick={close}>
            Demander un devis
          </Link>
          <Link href="/preview-refonte/projet" onClick={close}>
            Racontez-nous votre projet
          </Link>
        </nav>
      ) : null}
      <main id="contenu">{children}</main>
      <footer className="tba-footer">
        <div className="tba-footer-grid">
          <div>
            <p className="tba-logo">
              <AgencyLogo className="h-10 w-10" />
              <span>
                <small>Travel Business Agency</small>
                Travel BA
              </span>
            </p>
            <p>{siteConfig.address.full}</p>
            <p>
              <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
              <br />
              <a href={whatsappHref(waCopy.home)}>WhatsApp</a>
              <br />
              <a href="tel:+33772158257">07 72 15 82 57</a>
            </p>
          </div>
          <div>
            <h2>Univers</h2>
            <ul>
              {universes.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.title}</Link>
                </li>
              ))}
              <li>
                <Link href="/preview-refonte/espace-client">L’espace</Link>
              </li>
              <li>
                <Link href="/connexion">Entrer</Link>
              </li>
              <li>
                <Link href="/preview-refonte/projet">Racontez-nous votre projet</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>La maison</h2>
            <p>Atout France IM092260002</p>
            <p>APST n° 43865</p>
            <p>IATA 20291655</p>
          </div>
        </div>
        <p>
          {siteConfig.legal.legalName} — {siteConfig.legal.legalForm}, capital de {siteConfig.legal.capital}. {siteConfig.legal.rcs}.
        </p>
        <p>Les photographies donnent le ton. Elles ne montrent pas une adresse de la maison.</p>
        <p>Étude de refonte. Cette page n’est pas indexée.</p>
      </footer>
    </>
  );
}
