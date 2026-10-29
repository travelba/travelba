import type { Metadata } from "next";
import { HomeView } from "@/components/vitrine/HomeView";

export const metadata: Metadata = {
  title: { absolute: "Travel BA" },
  description:
    "Travel BA, agence IATA. L’application, le Club, les voyages signature, Kids, séminaires et déplacements. Étude non indexée.",
};

export default function PreviewHomePage() {
  return <HomeView />;
}
