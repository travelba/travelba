import Link from "next/link";
import type { ReactNode } from "react";
import { previewServices } from "./catalog";
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

export function ServiceGrid() {
  return (
    <section className="tba-equal" id="services" aria-labelledby="services-titre">
      <h2 id="services-titre">Une seule équipe pour tout le voyage.</h2>
      <p>De la première idée au dernier kilomètre. Chaque service ouvre sa page.</p>
      <div>
        {previewServices.map((service) => (
          <Link key={service.slug} href={`/preview-refonte/${service.slug}`}>
            <figure>
              <Photo
                id={service.image}
                alt={service.alt}
                sizes="(min-width: 1100px) 30vw, (min-width: 700px) 45vw, 100vw"
                width={1200}
              />
            </figure>
            <div>
              <h3>{service.menu}</h3>
              <p>{service.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ProjetInvite({ lede }: { lede: string }) {
  return (
    <section className="tba-invite">
      <p>{lede}</p>
      <Link className="tba-word" href="/preview-refonte/projet">
        Racontez-nous votre projet
      </Link>
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
