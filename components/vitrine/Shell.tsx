"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Lock, Mail, Phone } from "lucide-react";
import { PREVIEW } from "@/lib/vitrine/paths";
import { siteConfig } from "@/lib/site";

type LinkItem = { href: string; label: string };
type Column = { title: string; links: LinkItem[] };

const SERVICE: { title: string; links: LinkItem[] }[] = [
  {
    title: "Composer",
    links: [
      { href: `${PREVIEW}/sur-mesure`, label: "Sur mesure" },
      { href: `${PREVIEW}/services/a-deux`, label: "À deux" },
      { href: `${PREVIEW}/kids`, label: "En famille" },
      { href: `${PREVIEW}/services/ski`, label: "Ski" },
    ],
  },
  {
    title: "Le sol et l’air",
    links: [
      { href: `${PREVIEW}/services/jet-prive`, label: "Jet privé" },
      { href: `${PREVIEW}/services/chauffeur`, label: "Chauffeur" },
      { href: `${PREVIEW}/services/accueil-vip`, label: "Accueil VIP" },
    ],
  },
  {
    title: "Les adresses",
    links: [
      { href: `${PREVIEW}/services/hotels`, label: "Hôtels" },
      { href: `${PREVIEW}/services/restaurants`, label: "Restaurants" },
      { href: `${PREVIEW}/services/clubs`, label: "Clubs" },
    ],
  },
  {
    title: "Les occasions",
    links: [
      { href: `${PREVIEW}/seminaires`, label: "Séminaires" },
      { href: `${PREVIEW}/services/anniversaire`, label: "Anniversaire" },
      { href: `${PREVIEW}/services/evg`, label: "EVG" },
      { href: `${PREVIEW}/services/celebrations`, label: "Célébrations" },
      { href: `${PREVIEW}/services/prestige`, label: "Prestige" },
      { href: `${PREVIEW}/services/evenements`, label: "Événements" },
    ],
  },
];

const TOP = [
  { href: `${PREVIEW}/application`, label: "L’application", match: "/application" },
  { href: `${PREVIEW}/professionnels`, label: "L’entreprise", match: "/professionnels" },
  { href: `${PREVIEW}/club`, label: "Le Club", match: "/club" },
];

const EXPLORE: LinkItem[] = [
  { href: `${PREVIEW}/sur-mesure`, label: "Le service" },
  { href: `${PREVIEW}/application`, label: "L’application" },
  { href: `${PREVIEW}/voyages`, label: "Voyages signature" },
  { href: `${PREVIEW}/professionnels`, label: "Déplacements professionnels" },
  { href: `${PREVIEW}/club`, label: "Club Travel BA" },
  { href: `${PREVIEW}/contact`, label: "Écrire" },
  { href: "/fr/legal", label: "Mentions légales" },
];

export function Shell({
  signature,
  children,
}: {
  signature: Column[];
  children: ReactNode;
}) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const serviceOn = path.includes("/sur-mesure") || path.includes("/services") || path.includes("/kids") || path.includes("/seminaires");
  const signatureOn = path.includes("/voyages");

  return (
    <>
      <a className="vz-skip" href="#contenu">
        Aller au contenu
      </a>
      <header className={`vz-header${mobile ? " is-open" : ""}`}>
        <div className="vz-frame vz-header-bar">
          <Link href={PREVIEW} className="vz-brand" onClick={() => setMobile(false)}>
            <strong>Travel BA</strong>
            <span>Le service · L’expertise</span>
          </Link>
          <nav className="vz-nav" aria-label="Menu principal">
            <button type="button" className={serviceOn || open === "service" ? "is-on" : undefined} aria-expanded={open === "service"} onClick={() => setOpen((value) => (value === "service" ? null : "service"))}>
              Le service
            </button>
            <button type="button" className={signatureOn || open === "signatures" ? "is-on" : undefined} aria-expanded={open === "signatures"} onClick={() => setOpen((value) => (value === "signatures" ? null : "signatures"))}>
              Signatures
            </button>
            {TOP.map((item) => {
              const on = path.includes(item.match);
              return (
                <Link key={item.href} href={item.href} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined} onClick={() => setOpen(null)}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="vz-header-end">
            <Link className="vz-account" href="/connexion">
              <Lock size={16} strokeWidth={1.5} />
              <span>Espace client</span>
            </Link>
            <button
              type="button"
              className="vz-menu-btn"
              aria-label={mobile ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobile}
              onClick={() => setMobile((value) => !value)}
            >
              <i />
              <i />
              <i />
            </button>
          </div>
        </div>
      </header>

      {open === "service" ? (
        <div className="vz-panel" role="navigation" aria-label="Le service">
          {SERVICE.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              {column.links.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(null)}>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
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

      {mobile ? (
        <div className="vz-drawer" role="navigation" aria-label="Menu">
          <details open>
            <summary>Le service</summary>
            {SERVICE.flatMap((column) =>
              column.links.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
                  {item.label}
                </Link>
              )),
            )}
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
            <Link href={`${PREVIEW}/voyages`} onClick={() => setMobile(false)}>
              Les 43 créations
            </Link>
          </details>
          {TOP.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
              {item.label}
            </Link>
          ))}
          <Link href="/connexion" onClick={() => setMobile(false)}>
            Espace client
          </Link>
        </div>
      ) : null}

      <main id="contenu">{children}</main>

      <footer className="vz-footer">
        <div className="vz-frame">
          <div className="vz-footer-grid">
            <div className="vz-footer-brand">
              <strong>Travel BA</strong>
              <span>Haute orchestration du voyage</span>
              <p>
                Conciergerie de voyage, basée à {siteConfig.address.city}. Le service et l’expertise d’une équipe qui
                tient le séjour avant, pendant et après.
              </p>
            </div>
            <div>
              <p className="vz-caps">Exploration & services</p>
              <ul>
                {EXPLORE.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="vz-caps">Conciergerie VIP 24/7</p>
              <p>Un conseiller, à toute heure, pendant le voyage.</p>
              <p className="vz-footer-line">
                <span>{siteConfig.address.full}</span>
              </p>
              <p className="vz-footer-line">
                <Phone size={18} strokeWidth={1.5} />
                <a href="tel:+33772158257">07 72 15 82 57</a>
              </p>
              <p className="vz-footer-line">
                <Mail size={18} strokeWidth={1.5} />
                <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
              </p>
            </div>
          </div>
          <div className="vz-footer-end">
            <p>© TRAVEL BA. Tous droits réservés.</p>
            <p className="vz-trust">IATA 20291655 · Atout France IM092260002 · APST n°43865</p>
          </div>
        </div>
      </footer>
    </>
  );
}
