"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { siteConfig } from "@/lib/site";
import { waCopy, whatsappHref } from "./photos";

const NAV = [
  { href: "/preview-refonte/sur-mesure", label: "Sur-mesure" },
  { href: "/preview-refonte/seminaires", label: "Séminaires" },
  { href: "/preview-refonte/ski", label: "Ski" },
  { href: "/preview-refonte/espace-client", label: "L’espace" },
  { href: "/connexion", label: "Entrer" },
] as const;

export function Frame({
  children,
  whatsappText = waCopy.home,
}: {
  children: React.ReactNode;
  tone?: "overlay" | "solid";
  whatsappText?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const solid = scrolled || open;
  const wa = whatsappHref(whatsappText);

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

  return (
    <>
      <a className="tba-skip" href="#contenu">
        Aller au contenu
      </a>
      <header className={solid ? "tba-header is-solid" : "tba-header"}>
        <Link href="/preview-refonte" className="tba-logo">
          <AgencyLogo className="h-9 w-9" />
          <span>
            <small>Travel Business Agency</small>
            Travel BA
          </span>
        </Link>
        <nav className="tba-nav" aria-label="La maison">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
          <a className="tba-nav-cta" href={wa} target="_blank" rel="noopener noreferrer">
            Écrire
          </a>
        </nav>
        <button
          type="button"
          className="tba-menu-btn"
          aria-expanded={open}
          aria-controls="tba-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Fermer" : "Menu"}
        </button>
      </header>
      {open ? (
        <nav id="tba-menu" className="tba-menu" aria-label="Menu">
          <Link href="/preview-refonte" onClick={() => setOpen(false)}>
            La maison
          </Link>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <a href={wa} target="_blank" rel="noopener noreferrer">
            Écrire
          </a>
          <a href="#brief" onClick={() => setOpen(false)}>
            Un brief
          </a>
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
              <a href={`tel:+${siteConfig.whatsappNumber}`}>{siteConfig.phoneDisplay}</a>
            </p>
          </div>
          <div>
            <h2>Pages</h2>
            <ul>
              <li>
                <Link href="/preview-refonte">La maison</Link>
              </li>
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>La maison</h2>
            <p>IATA 20291655</p>
            <p>Atout France IM092260002</p>
            <p>APST n° 43865</p>
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
