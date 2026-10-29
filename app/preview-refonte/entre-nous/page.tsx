import type { Metadata } from "next";
import { OfferView } from "@/components/preview-refonte/OfferView";

export const metadata: Metadata = { title: "À deux", description: "Escapades à deux. Étude non indexée." };

export default function EntreNousPage() {
  return <OfferView slug="entre-nous" />;
}
