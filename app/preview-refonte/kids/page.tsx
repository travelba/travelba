import type { Metadata } from "next";
import { OfferView } from "@/components/preview-refonte/OfferView";

export const metadata: Metadata = { title: "En famille", description: "Séjours en famille. Étude non indexée." };

export default function KidsPage() {
  return <OfferView slug="kids" />;
}
