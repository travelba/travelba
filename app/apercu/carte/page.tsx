import type { Metadata } from "next";
import { CarteApercu } from "./ui";

export const metadata: Metadata = {
  title: "Carte — aperçu",
  robots: { index: false, follow: false },
};

/** Fermé en production par le proxy (`/apercu`). */
export default function CartePreviewPage() {
  return <CarteApercu />;
}
