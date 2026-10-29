import type { Metadata } from "next";
import { CatalogView } from "@/components/vitrine/CatalogView";

export const metadata: Metadata = {
  title: "Voyages signature",
  description:
    "Quarante-trois voyages signature Travel BA. Amériques, Afrique, Moyen-Orient, Asie, Pacifique. Étude non indexée.",
};

export default function VoyagesPage() {
  return <CatalogView />;
}
