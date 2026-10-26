"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Award, Lock, Mail, Phone, Shield, BadgeCheck } from "lucide-react";
import { PREVIEW } from "@/lib/vitrine/paths";
import { siteConfig } from "@/lib/site";

type LinkItem = { href: string; label: string };
type Column = { title: string; links: LinkItem[] };

const NAV = [
  { href: `${PREVIEW}/club`, label: "Club Travel BA", match: "/club" },
  { href: `${PREVIEW}/sur-mesure`, label: "Voyages sur mesure", match: "/sur-mesure" },
  { href: `${PREVIEW}/voyages`, label: "Voyages signature", match: "/voyages", home: true },
  { href: `${PREVIEW}/kids`, label: "Univers Kids", match: "/kids" },
  { href: `${PREVIEW}/seminaires`, label: "Séminaires & événements", match: "/seminaires" },
  { href: `${PREVIEW}/professionnels`, label: "Déplacements professionnels", match: "/professionnels" },
];

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

const EXPLORE: LinkItem[] = [
  { href: `${PREVIEW}/club`, label: "Club Travel BA" },
  { href: `${PREVIEW}/sur-mesure`, label: "Voyages sur mesure" },
  { href: `${PREVIEW}/voyages`, label: "Voyages signature" },
  { href: `${PREVIEW}/kids`, label: "Univers Kids" },
  { href: `${PREVIEW}/seminaires`, label: "Séminaires & événements" },
  { href: `${PREVIEW}/professionnels`, label: "Déplacements professionnels" },
  { href: "/fr/legal", label: "Mentions légales" },
  { href: "/fr/legal", label: "Politique de confidentialité" },
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
  const home = path === PREVIEW;

  return (
    <>
      <a className="vz-skip" href="#contenu">
        Aller au contenu
      </a>
      <header className={`vz-header${mobile ? " is-open" : ""}`}>
        <div className="vz-frame vz-header-bar">
          <Link href={PREVIEW} className="vz-brand" onClick={() => setMobile(false)}>
            <strong>Travel BA</strong>
            <span>Membre accrédité IATA</span>
          </Link>
          <nav className="vz-nav" aria-label="Menu principal">
            {NAV.map((item) => {
              const on = path.includes(item.match) || (home && item.home);
              return (
                <Link key={item.href} href={item.href} className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined}>
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

      {mobile ? (
        <div className="vz-drawer" role="navigation" aria-label="Menu">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
              {item.label}
            </Link>
          ))}
          <Link href={`${PREVIEW}/application`} onClick={() => setMobile(false)}>
            L&apos;application
          </Link>
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
            <Link href={`${PREVIEW}/voyages`} onClick={() => setMobile(false)}>
              Les 43 créations
            </Link>
          </details>
          <details>
            <summary>Séminaires et événements</summary>
            {EVENTS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobile(false)}>
                {item.label}
              </Link>
            ))}
          </details>
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
                Maison d&apos;orfèvrerie du voyage d&apos;exception et conciergerie privée pour voyageurs avertis,
                dirigeants et familles exigeantes. Accréditation officielle IATA.
              </p>
              <div className="vz-stamps">
                <div>
                  <BadgeCheck size={22} strokeWidth={1.5} />
                  <p>
                    <b>Agence accréditée IATA</b>
                    <small>20291655</small>
                  </p>
                </div>
                <div>
                  <Award size={22} strokeWidth={1.5} />
                  <p>
                    <b>Atout France</b>
                    <small>IM092260002</small>
                  </p>
                </div>
                <div>
                  <Shield size={22} strokeWidth={1.5} />
                  <p>
                    <b>Membre de l&apos;APST</b>
                    <small>n°43865</small>
                  </p>
                </div>
              </div>
            </div>
            <div>
              <p className="vz-caps">Exploration & services</p>
              <ul>
                {EXPLORE.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className={item.href.endsWith("/voyages") ? "is-on" : undefined}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="vz-caps">Conciergerie VIP 24/7</p>
              <p>Une ligne directe et sécurisée réservée exclusivement aux membres en déplacement.</p>
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
            <p>© TRAVEL BA. Tous droits réservés. Agence de voyages d&apos;exception accréditée IATA.</p>
            <p>Conçu comme un livre d&apos;art · Toutes destinations privatives</p>
          </div>
        </div>
      </footer>
    </>
  );
}
