"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PREVIEW } from "@/lib/vitrine/paths";
import { siteConfig } from "@/lib/site";

type LinkItem = { href: string; label: string };
type Column = { title: string; links: LinkItem[] };

const MEASURE: LinkItem[] = [
  { href: `${PREVIEW}/sur-mesure`, label: "Le voyage" },
  { href: `${PREVIEW}/services/a-deux`, label: "À deux" },
  { href: `${PREVIEW}/services/ski`, label: "Ski" },
  { href: `${PREVIEW}/services/jet-prive`, label: "Jet privé" },
  { href: `${PREVIEW}/services/chauffeur`, label: "Chauffeur" },
  { href: `${PREVIEW}/services/accueil-vip`, label: "Accueil VIP" },
  { href: `${PREVIEW}/services/restaurants`, label: "Restaurants" },
  { href: `${PREVIEW}/services/hotels`, label: "Hôtels" },
  { href: `${PREVIEW}/services/clubs`, label: "Clubs" },
];

const EVENTS: LinkItem[] = [
  { href: `${PREVIEW}/seminaires`, label: "Séminaires" },
  { href: `${PREVIEW}/services/anniversaire`, label: "Anniversaire" },
  { href: `${PREVIEW}/services/evg`, label: "EVG" },
  { href: `${PREVIEW}/services/celebrations`, label: "Célébrations" },
  { href: `${PREVIEW}/services/prestige`, label: "Prestige" },
  { href: `${PREVIEW}/services/evenements`, label: "Événements" },
];

export function Shell({
  signature,
  children,
}: {
  signature: Column[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);

  function toggle(id: string) {
    setMobile(false);
    setOpen((current) => (current === id ? null : id));
  }

  return (
    <>
      <a className="vz-skip" href="#contenu">
        Aller au contenu
      </a>
      <header className={`vz-header is-paper${open || mobile ? " is-open" : ""}`}>
        <Link href={PREVIEW} className="vz-brand" onClick={() => { setOpen(null); setMobile(false); }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo local */}
          <img src="/brand/logo-tba-256.png" alt="" />
          <div>
            <strong>Travel BA</strong>
            <span>Agence IATA</span>
          </div>
        </Link>
        <nav className="vz-nav" aria-label="Menu principal">
          <Link href={`${PREVIEW}/application`}>L’application</Link>
          <Link href={`${PREVIEW}/club`}>Club</Link>
          <button type="button" aria-expanded={open === "mesure"} onClick={() => toggle("mesure")}>
            Sur mesure
          </button>
          <button type="button" aria-expanded={open === "signatures"} onClick={() => toggle("signatures")}>
            Signatures
          </button>
          <Link href={`${PREVIEW}/kids`}>Kids</Link>
          <button type="button" aria-expanded={open === "events"} onClick={() => toggle("events")}>
            Séminaires
          </button>
          <Link href={`${PREVIEW}/professionnels`}>Professionnels</Link>
          <Link className="vz-account" href="/connexion">
            Espace client
          </Link>
        </nav>
        <button
          type="button"
          className="vz-menu-btn"
          aria-label={mobile ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={mobile}
          onClick={() => {
            setOpen(null);
            setMobile((value) => !value);
          }}
        >
          <i />
          <i />
          <i />
        </button>
      </header>

      {open === "mesure" ? (
        <div className="vz-panel" role="navigation" aria-label="Voyages sur mesure">
          <div>
            <h2>Composer</h2>
            {MEASURE.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(null)}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {open === "signatures" ? (
        <div className="vz-panel" role="navigation" aria-label="Voyages signature">
          {signature.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              {column.links.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(null)}>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <div>
            <h2>Tous</h2>
            <Link href={`${PREVIEW}/voyages`} onClick={() => setOpen(null)}>
              Le catalogue
            </Link>
          </div>
        </div>
      ) : null}

      {open === "events" ? (
        <div className="vz-panel" role="navigation" aria-label="Séminaires et événements">
          <div>
            <h2>Occasions</h2>
            {EVENTS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(null)}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {mobile ? (
        <div className="vz-drawer" role="navigation" aria-label="Menu">
          <Link href={`${PREVIEW}/application`} onClick={() => setMobile(false)}>L’application</Link>
          <Link href={`${PREVIEW}/club`} onClick={() => setMobile(false)}>Club Travel BA</Link>
          <details>
            <summary>Sur mesure</summary>
            {MEASURE.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
                {item.label}
              </Link>
            ))}
          </details>
          <details>
            <summary>Voyages signature</summary>
            {signature.flatMap((column) =>
              column.links.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
                  {item.label}
                </Link>
              )),
            )}
          </details>
          <Link href={`${PREVIEW}/kids`} onClick={() => setMobile(false)}>Kids</Link>
          <details>
            <summary>Séminaires et événements</summary>
            {EVENTS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
                {item.label}
              </Link>
            ))}
          </details>
          <Link href={`${PREVIEW}/professionnels`} onClick={() => setMobile(false)}>Professionnels</Link>
          <Link href="/connexion" onClick={() => setMobile(false)}>Espace client</Link>
        </div>
      ) : null}

      <main id="contenu">{children}</main>

      <footer className="vz-footer">
        <div className="vz-footer-grid">
          <div>
            <h2>Travel BA</h2>
            <p>
              {siteConfig.address.full}
              <br />
              <a href={`tel:+${siteConfig.whatsappNumber}`}>{siteConfig.phoneDisplay}</a>
              <br />
              <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
            </p>
          </div>
          <div>
            <Link href={`${PREVIEW}/application`}>L’application</Link>
            <Link href={`${PREVIEW}/club`}>Club Travel BA</Link>
            <Link href={`${PREVIEW}/voyages`}>Voyages signature</Link>
            <Link href={`${PREVIEW}/kids`}>Kids</Link>
            <Link href={`${PREVIEW}/contact`}>Écrire à la maison</Link>
            <Link href="/connexion">Espace client</Link>
          </div>
          <div>
            <Link href="/fr/legal">Mentions légales</Link>
            <p>Accréditée IATA · Membre APST. Garantie financière APST.</p>
            <p>Le carnet s’ouvre dans l’application, après la réservation.</p>
          </div>
        </div>
        <small>Étude non publiée · {siteConfig.legal.legalName} · {siteConfig.legal.rcs}</small>
      </footer>
    </>
  );
}
