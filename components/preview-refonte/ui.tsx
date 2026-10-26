import Link from "next/link";
import type { ReactNode } from "react";
import { Photo } from "./Photo";

export function PageHero({
  eyebrow,
  title,
  lede,
  image,
  alt,
  children,
}: {
  eyebrow: string;
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
        <p className="tba-kicker tba-kicker-light">{eyebrow}</p>
        <h1 className="tba-hero-title">{title}</h1>
        <p className="tba-lede tba-lede-light">{lede}</p>
        {children}
        <p className="tba-hero-caption">Image d’atmosphère</p>
      </div>
    </section>
  );
}

export function SectionHead({
  kicker,
  title,
  lede,
  light = false,
  id,
}: {
  kicker: string;
  title: string;
  lede?: string;
  light?: boolean;
  id?: string;
}) {
  return (
    <header className="tba-section-head">
      <p className={light ? "tba-kicker tba-kicker-light" : "tba-kicker"}>{kicker}</p>
      <h2 className="tba-h2" id={id}>{title}</h2>
      {lede ? <p className={light ? "tba-lede tba-lede-light" : "tba-lede"}>{lede}</p> : null}
    </header>
  );
}

export function Door({
  href,
  index,
  title,
  text,
  image,
  alt,
}: {
  href: string;
  index: string;
  title: string;
  text: string;
  image: string;
  alt: string;
}) {
  return (
    <Link href={href} className="tba-door">
      <Photo id={image} alt={alt} sizes="(min-width: 900px) 50vw, 100vw" width={1800} className="tba-zoom" />
      <span className="tba-door-shade" aria-hidden="true" />
      <span className="tba-door-copy">
        <span className="tba-kicker tba-kicker-light">{index}</span>
        <span className="tba-door-title">{title}</span>
        <span className="tba-door-text">{text}</span>
      </span>
    </Link>
  );
}

export function PlaceCard({
  href,
  name,
  line,
  image,
  alt,
}: {
  href?: string;
  name: string;
  line: string;
  image: string;
  alt: string;
}) {
  const inner = (
    <>
      <Photo id={image} alt={alt} sizes="(min-width: 900px) 33vw, 80vw" width={1400} className="tba-zoom" />
      <span className="tba-place-shade" aria-hidden="true" />
      <span className="tba-place-copy">
        <span className="tba-place-name">{name}</span>
        <span className="tba-place-line">{line}</span>
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="tba-place">
        {inner}
      </Link>
    );
  }
  return <article className="tba-place">{inner}</article>;
}

export function AtmosphereNote() {
  return (
    <p className="tba-note">
      Photographies d’atmosphère, libres de droits. Elles ne désignent pas un établissement de la maison.
    </p>
  );
}

const CREDS = [
  { label: "IATA", value: "20291655" },
  { label: "APST", value: "n° 43865" },
  { label: "Atout France", value: "IM092260002" },
  { label: "Réseau", value: "Membre My Little Emperor" },
];

export function Trust({ withBlanks = false }: { withBlanks?: boolean }) {
  return (
    <section id="preuves" aria-labelledby="preuves-titre">
      <SectionHead
        id="preuves-titre"
        kicker="Repères"
        title="La maison, en clair."
        lede="Les accréditations sont celles de Travel Business Agency. Les chiffres et les paroles de clients attendent d’être fournis : rien n’est inventé."
      />
      <ul className="tba-creds">
        {CREDS.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
      {withBlanks ? (
        <>
          <ul className="tba-blanks">
            <li>
              <span>Témoignages</span>
              <strong>à fournir</strong>
            </li>
            <li>
              <span>Séjours accompagnés</span>
              <strong>à fournir</strong>
            </li>
            <li>
              <span>Années d’exercice</span>
              <strong>à fournir</strong>
            </li>
          </ul>
          <p className="tba-note">Aucun témoignage, aucun volume. Ces emplacements restent vides jusqu’à preuve.</p>
        </>
      ) : null}
    </section>
  );
}

export const places = [
  {
    href: "/preview-refonte/seminaires",
    name: "Marrakech",
    line: "Médina, jardins, palais",
    image: "photo-1597212618440-806262de4f6b",
    alt: "Jardin aux murs bleus et bassin, à Marrakech",
  },
  {
    href: "/preview-refonte/sur-mesure",
    name: "Maldives",
    line: "Lagons",
    image: "photo-1514282401047-d79a71a590e8",
    alt: "Villas sur pilotis dans un lagon",
  },
  {
    href: "/preview-refonte/sur-mesure",
    name: "Kyoto",
    line: "Temples et saisons",
    image: "photo-1493976040374-85c8e12f0c0e",
    alt: "Pagode dans une forêt",
  },
  {
    href: "/preview-refonte/sur-mesure",
    name: "Côte amalfitaine",
    line: "Villages suspendus",
    image: "photo-1533104816931-20fa691ff6ca",
    alt: "Maisons colorées accrochées à une falaise",
  },
  {
    href: "/preview-refonte/sur-mesure",
    name: "Seychelles",
    line: "Îles",
    image: "photo-1540202404-a2f29016b523",
    alt: "Plage, rochers et eau turquoise",
  },
  {
    href: "/preview-refonte/ski",
    name: "Courchevel",
    line: "Neige",
    image: "photo-1605540436563-5bca919ae766",
    alt: "Piste enneigée et skieurs",
  },
] as const;

export function Places() {
  return (
    <div>
      <div className="tba-places">
        {places.map((place) => (
          <PlaceCard key={place.name} {...place} />
        ))}
      </div>
      <AtmosphereNote />
    </div>
  );
}
