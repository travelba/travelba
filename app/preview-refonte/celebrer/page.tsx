import type { Metadata } from "next";
import { OfferView } from "@/components/preview-refonte/OfferView";

export const metadata: Metadata = { title: "Célébrations", description: "Soirées et grands rendez-vous. Étude non indexée." };

export default function CelebrerPage() {
  return <OfferView slug="celebrer" />;
}
