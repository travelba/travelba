import type { Metadata } from "next";
import { ApplicationView } from "@/components/vitrine/ApplicationView";

export const metadata: Metadata = {
  title: "L’application",
  description:
    "L’application Travel BA. Carnet jour par jour, documents, tables, accueil, conseiller. Séjour d’exemple, aucun client réel. Étude non indexée.",
};

export default function ApplicationPage() {
  return <ApplicationView />;
}
