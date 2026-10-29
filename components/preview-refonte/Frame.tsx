"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { siteConfig } from "@/lib/site";
import { offers } from "./offers";
import { waCopy, whatsappHref } from "./photos";

export function Frame({ children }: { children: React.ReactNode; tone?: "overlay" | "solid"; whatsappText?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [offres, setOffres] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const solid = scrolled || open || offres;
  const wa = whatsappHref(waCopy.home);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open && !offres) return;
    const previous = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setOffres(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, offres]);

  const close = () => {
    setOpen(false);
    setOffres(false);
  };

  return (
    <>
      <a className="tba-skip" href="#contenu">
        Aller au contenu
      </a>
      <header className={solid ? "tba-header is-solid" : "tba-header"}>
        <div className="tba-header-bar">
          <Link href="/preview-refonte" className="tba-logo" onClick={close}>
            <AgencyLogo className="h-9 w-9" />
            <span>
              <small>Travel Business Agency</small>
              Travel BA
            </span>
          </Link>
          <nav className="tba-nav" aria-label="La maison">
            <Link href="/preview-refonte" aria-current={pathname === "/preview-refonte" ? "page" : undefined} onClick={close}>
              Accueil
            </Link>
            <Link
              href="/preview-refonte/application"
              aria-current={pathname === "/preview-refonte/application" ? "page" : undefined}
              onClick={close}
            >
              L’application
            </Link>
            <button type="button" className="tba-nav-services" aria-expanded={offres} onClick={() => setOffres((value) => !value)}>
              Offres
            </button>
            <Link href="/preview-refonte#apropos" onClick={close}>
              À propos
            </Link>
            <Link href="/preview-refonte#devis" onClick={close}>
              Contact
            </Link>
            <Link className="tba-nav-cta" href="/preview-refonte#devis" onClick={close}>
              Faire une demande
            </Link>
          </nav>
          <button type="button" className="tba-menu-btn" aria-expanded={open} aria-controls="tba-menu" onClick={() => setOpen((value) => !value)}>
            {open ? "Fermer" : "Menu"}
          </button>
        </div>
        <Link className="tba-app-strip" href="/preview-refonte/application" onClick={close}>
          <strong>Application</strong>
          <span>Votre voyage, dans votre poche</span>
        </Link>
      </header>
      {offres ? (
        <nav className="tba-offer-menu" aria-label="Offres">
          {offers.map((offer) => (
            <Link key={offer.slug} href={offer.href} aria-current={pathname === offer.href ? "page" : undefined} onClick={close}>
              {offer.menu}
            </Link>
          ))}
        </nav>
      ) : null}
      {open ? (
        <nav id="tba-menu" className="tba-menu" aria-label="Menu">
          <Link href="/preview-refonte" onClick={close}>
            Accueil
          </Link>
          <Link href="/preview-refonte/application" onClick={close}>
            L’application
          </Link>
          <Link href="/preview-refonte/espace-client" onClick={close}>
            Espace
          </Link>
          <Link href="/preview-refonte#apropos" onClick={close}>
            À propos
          </Link>
          <Link href="/preview-refonte#devis" onClick={close}>
            Contact
          </Link>
          {offers.map((offer) => (
            <Link key={offer.slug} href={offer.href} onClick={close}>
              {offer.menu}
            </Link>
          ))}
          <Link href="/connexion" onClick={close}>
            Entrer
          </Link>
        </nav>
      ) : null}
      <main id="contenu">{children}</main>
      <footer className="tba-footer">
        <Link className="tba-app-strip is-footer" href="/preview-refonte/application">
          <strong>Application</strong>
          <span>Carnet, documents, embarquement, concierge.</span>
          <em>Voir</em>
        </Link>
        <div className="tba-footer-grid">
          <div>
            <p className="tba-logo">
              <AgencyLogo className="h-10 w-10" />
              <span>
                <small>Travel Business Agency</small>
                Travel BA
              </span>
            </p>
            <p>Ultra-personnalisé. Ultra-réactif. Partout, tout le temps.</p>
            <p>{siteConfig.address.full}</p>
          </div>
          <div>
            <h2>Navigation</h2>
            <ul>
              <li>
                <Link href="/preview-refonte">Accueil</Link>
              </li>
              <li>
                <Link href="/preview-refonte/application">L’application</Link>
              </li>
              {offers.map((offer) => (
                <li key={offer.slug}>
                  <Link href={offer.href}>{offer.menu}</Link>
                </li>
              ))}
              <li>
                <Link href="/preview-refonte/espace-client">Espace</Link>
              </li>
              <li>
                <Link href="/preview-refonte#devis">Faire une demande</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Contact</h2>
            <p>
              <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
            </p>
            <p>
              <a href="tel:+33772158257">07 72 15 82 57</a>
            </p>
            <p>
              <a href={wa}>WhatsApp</a>
            </p>
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
