"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { waCopy, whatsappHref } from "./photos";

const NAV = [
  { href: "/preview-refonte/sur-mesure", label: "Sur-mesure" },
  { href: "/preview-refonte/seminaires", label: "Séminaires" },
  { href: "/preview-refonte/ski", label: "Ski" },
  { href: "/preview-refonte/espace-client", label: "Espace client" },
] as const;

export function Frame({
  children,
  tone = "overlay",
  whatsappText = waCopy.home,
}: {
  children: React.ReactNode;
  tone?: "overlay" | "solid";
  whatsappText?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const solid = tone === "solid" || scrolled || open;
  const wa = whatsappHref(whatsappText);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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
          <span className="tba-logo-name">Travel BA</span>
          <span className="tba-logo-note">Aperçu</span>
        </Link>
        <nav className="tba-nav" aria-label="Univers">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
          <a href={wa} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a className={solid ? "tba-btn tba-btn-small" : "tba-btn tba-btn-small tba-btn-light"} href="#rendez-vous">
            Rendez-vous
          </a>
        </nav>
        <button
          type="button"
          className="tba-burger"
          aria-expanded={open}
          aria-controls="tba-menu"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>
      {open ? (
        <nav id="tba-menu" className="tba-menu" aria-label="Menu">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="tba-menu-link"
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="tba-menu-actions">
            <a className="tba-btn" href={wa} target="_blank" rel="noopener noreferrer">
              Écrire sur WhatsApp
            </a>
            <a className="tba-btn tba-btn-ghost" href="#brief" onClick={() => setOpen(false)}>
              Déposer un brief
            </a>
            <a className="tba-btn tba-btn-ghost" href="#rendez-vous" onClick={() => setOpen(false)}>
              Prendre rendez-vous
            </a>
          </div>
        </nav>
      ) : null}
      <main id="contenu">{children}</main>
      <footer className="tba-footer">
        <div className="tba-footer-grid">
          <div>
            <p className="tba-logo-name tba-serif">Travel BA</p>
            <p>{siteConfig.address.full}</p>
            <p>
              <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
              <br />
              <a href={`tel:+${siteConfig.whatsappNumber}`}>{siteConfig.phoneDisplay}</a>
            </p>
          </div>
          <div>
            <h2>Univers</h2>
            <ul>
              <li>
                <Link href="/preview-refonte">Accueil</Link>
              </li>
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Accréditations</h2>
            <p>IATA 20291655</p>
            <p>APST n° 43865</p>
            <p>Atout France IM092260002</p>
            <p>Membre du réseau My Little Emperor</p>
          </div>
        </div>
        <p>
          {siteConfig.legal.legalName} — {siteConfig.legal.legalForm}, capital de {siteConfig.legal.capital}. {siteConfig.legal.rcs}.
        </p>
        <p>Maquette d’aperçu. Cette page n’est pas indexée.</p>
      </footer>
    </>
  );
}
