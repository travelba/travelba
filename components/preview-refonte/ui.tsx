import Link from "next/link";
import type { ReactNode } from "react";
import { Photo } from "./Photo";

export function PageHero({
  title,
  lede,
  image,
  alt,
  children,
}: {
  title: ReactNode;
  lede: string;
  image: string;
  alt: string;
  children?: ReactNode;
}) {
  return (
    <section className="tba-hero">
      <Photo id={image} alt={alt} sizes="100vw" preload width={2400} className="tba-hero-img" />
      <div className="tba-hero-shade" aria-hidden="true" />
      <div className="tba-hero-copy">
        <h1>{title}</h1>
        <p className="tba-lead">{lede}</p>
        {children}
      </div>
    </section>
  );
}

export function Split({
  id,
  title,
  text,
  image,
  alt,
  href,
  more,
  flip = false,
}: {
  id?: string;
  title: string;
  text: string;
  image: string;
  alt: string;
  href?: string;
  more?: string;
  flip?: boolean;
}) {
  return (
    <section id={id} className={flip ? "tba-split is-flip" : "tba-split"}>
      <figure>
        <Photo id={image} alt={alt} sizes="(min-width: 960px) 58vw, 100vw" width={2000} className="tba-hero-img" />
      </figure>
      <div className="tba-split-copy">
        <h2>{title}</h2>
        <p>{text}</p>
        {href && more ? (
          <Link className="tba-word" href={href}>
            {more}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export const services = [
  { href: "/preview-refonte/sur-mesure", name: "Voyages sur mesure", line: "Luxe et VIP. Le séjour composé autour de vous." },
  { href: "#hotels", name: "Hôtels", line: "Palaces et maisons. Les avantages du tarif, confirmés." },
  { href: "#vols", name: "Vols et billetterie", line: "L’émission des billets, tenue dans le carnet." },
  { href: "#vols", name: "Jets privés", line: "L’affrètement, lorsque le voyage l’appelle." },
  { href: "#vols", name: "Trains", line: "Le rail suit la même carte que le vol." },
  { href: "#vols", name: "Bateaux", line: "La traversée, lorsqu’elle fait partie du séjour." },
  { href: "/preview-refonte/seminaires", name: "Séminaires et incentives", line: "Marrakech en tête. Événements privés et d’entreprise." },
  { href: "#ville", name: "Événements de prestige", line: "Roland-Garros, Formule 1, Coupe du monde, festivals, galas." },
  { href: "#ville", name: "Tables et clubs", line: "Restaurants, salons, soirées." },
  { href: "#ville", name: "Activités", line: "La journée sur place, écrite dans le carnet." },
  { href: "/preview-refonte/ski", name: "Ski premium", line: "Chalets et palaces." },
  { href: "#sol", name: "Transferts", line: "De l’avion à la maison, et le retour." },
  { href: "#sol", name: "Chauffeurs", line: "La voiture conduite, en discrétion." },
  { href: "#sol", name: "Voitures", line: "Le véhicule, distinct du chauffeur." },
  { href: "#sol", name: "Fast track et accueil VIP", line: "Le passage en aéroport, à l’arrivée comme au départ." },
  { href: "#formalites", name: "Formalités", line: "ESTA, ETA Royaume-Uni, ETA Israël, visas." },
  { href: "#formalites", name: "Assurance", line: "Lorsqu’elle est au dossier." },
  { href: "/preview-refonte/espace-client", name: "Carnet de voyage", line: "Le séjour, ouvert dans l’espace." },
  { href: "#espace", name: "Conciergerie", line: "WhatsApp, à toute heure." },
  { href: "#fidelite", name: "Fidélité", line: "Les numéros de vos programmes, gardés sur la fiche." },
] as const;

export function ServiceIndex() {
  return (
    <section className="tba-index" id="services" aria-labelledby="services-titre">
      <h2 id="services-titre">La maison tient tout le voyage.</h2>
      <ol>
        {services.map((item) => (
          <li key={item.name}>
            <Link href={item.href}>
              <strong>{item.name}</strong>
              <em>{item.line}</em>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Credentials() {
  return (
    <section className="tba-creds" aria-label="Accréditations">
      <p>IATA 20291655 · Atout France IM092260002 · APST n° 43865</p>
      <span>Agence accréditée. Garantie financière des règlements.</span>
    </section>
  );
}
