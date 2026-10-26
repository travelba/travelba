import Link from "next/link";
import { notFound } from "next/navigation";
import { Frame } from "./Frame";
import { offers, offerBySlug, type Offer } from "./offers";
import { Photo } from "./Photo";

export function OfferView({ slug }: { slug: string }) {
  const offer = offerBySlug(slug);
  if (!offer) notFound();
  const others = offers.filter((item) => item.slug !== offer.slug).slice(0, 2);
  return (
    <Frame>
      <article className="tba-inner">
        <p className="tba-kicker">{offer.eyebrow}</p>
        <h1>{offer.title}</h1>
        <p className="tba-inner-lede">{offer.lede}</p>
        <figure className="tba-frame tba-inner-photo">
          <Photo id={offer.image} alt={offer.alt} sizes="100vw" preload />
        </figure>
        <ol className="tba-chapters">
          {offer.chapters.map((chapter) => (
            <li key={chapter.n}>
              <span>{chapter.n}</span>
              <div>
                <h2>{chapter.title}</h2>
                <p>{chapter.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {offer.inspirations ? <Inspirations items={offer.inspirations} /> : null}
        <footer className="tba-inner-end">
          <h2>Parlons de votre projet.</h2>
          <div className="tba-actions">
            <Link className="tba-word" href="/preview-refonte#devis">
              Demander un devis
            </Link>
            {others.map((item) => (
              <Link key={item.slug} className="tba-word is-quiet" href={item.href}>
                {item.menu}
              </Link>
            ))}
          </div>
        </footer>
      </article>
    </Frame>
  );
}

function Inspirations({ items }: { items: NonNullable<Offer["inspirations"]> }) {
  return (
    <section className="tba-insp" aria-label="Inspirations">
      <h2>Inspirations</h2>
      <p>Des maisons réelles, un déroulé possible. Aucun client n’est cité. Aucun prix n’est indiqué.</p>
      {items.map((item) => (
        <article key={`${item.place}-${item.hotel}`}>
          <p>{item.place}</p>
          <h3>{item.hotel}</h3>
          <p>{item.text}</p>
        </article>
      ))}
    </section>
  );
}
