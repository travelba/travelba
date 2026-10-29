import type { Metadata } from "next";
import { OfferView } from "@/components/preview-refonte/OfferView";

export const metadata: Metadata = { title: "Ski", description: "Semaine de ski premium. Étude non indexée." };

export default function MontagnePage() {
  return <OfferView slug="montagne" />;
}
