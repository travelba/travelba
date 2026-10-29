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
  "Transferts et accueil inclus. Club selon l’hôtel : petit-déjeuner, horaires, surclassement, jusqu’à 200 $ de crédit.";
