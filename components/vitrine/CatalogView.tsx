import Link from "next/link";
import { Photo } from "@/components/vitrine/Photo";
import { destinationsByRegion } from "@/lib/vitrine/destinations";
import { PREVIEW } from "@/lib/vitrine/paths";
import { REGIONS } from "@/lib/vitrine/types";

export function CatalogView() {
  return (
    <article>
      <header className="vz-section" style={{ paddingTop: "8rem" }}>
        <p className="vz-kicker">Voyages signature</p>
        <h1>43 voyages prêts à réserver.</h1>
        <p className="vz-lede">Saison, hôtels, jour par jour. Le détail se confirme avec le conseiller.</p>
      </header>
      {REGIONS.map((region, index) => {
        const items = destinationsByRegion(region.id);
        const cover = items[0];
        if (!cover) return null;
        return (
          <section key={region.id} className={`vz-catalog-region${index % 2 ? " is-flip" : ""}`}>
            <figure>
              <Photo id={cover.image} alt={cover.alt} />
            </figure>
            <div>
              <h2>{region.label}</h2>
              <ul>
                {items.flatMap((item) =>
                  item.slug === "inde" ? (
                    item.itineraries.map((trip) => (
                      <li key={trip.anchor}>
                        <Link href={`${PREVIEW}/voyages/inde#${trip.anchor}`}>
                          <strong>{trip.name}</strong>
                          <span>
                            {trip.duration} · {trip.title}
                          </span>
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li key={item.slug}>
                      <Link href={`${PREVIEW}/voyages/${item.slug}`}>
                        <strong>{item.name}</strong>
                        <span>
                          {item.itineraries[0]?.duration} · {item.line}
                        </span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </section>
        );
      })}
    </article>
  );
}
