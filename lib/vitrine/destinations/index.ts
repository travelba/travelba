import type { Destination, RegionId } from "../types";
import { REGIONS } from "../types";
import { africa } from "./africa";
import { americas } from "./americas";
import { asia } from "./asia";
import { islands } from "./islands";
import { orient } from "./orient";
import { voyagePath } from "../paths";

export const destinations: Destination[] = [...americas, ...africa, ...orient, ...asia, ...islands];

export function destinationBySlug(slug: string) {
  return destinations.find((item) => item.slug === slug) ?? null;
}

export function destinationsByRegion(region: RegionId) {
  return destinations.filter((item) => item.region === region);
}

export function signatureMenu() {
  return REGIONS.map((region) => ({
    title: region.label,
    links: destinationsByRegion(region.id).flatMap((item) => {
      if (item.slug === "inde") {
        return [
          { href: voyagePath("inde", "nord"), label: "Inde du Nord" },
          { href: voyagePath("inde", "sud"), label: "Inde du Sud" },
        ];
      }
      return [{ href: voyagePath(item.slug), label: item.name }];
    }),
  }));
}

export const CLUB_NOTE =
  "Les transferts et l’accueil à l’arrivée, puis au départ, sont tenus par la maison. Les avantages du Club Travel BA s’appliquent aux hôtels du séjour lorsqu’ils existent pour l’adresse : petit-déjeuner, arrivée anticipée ou départ tardif, surclassement si une chambre est libre, et, selon l’hôtel, un crédit de dépenses pouvant aller jusqu’à 200 dollars. Le détail se confirme avec le conseiller. Sur demande.";
