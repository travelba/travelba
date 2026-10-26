import type { Metadata, Viewport } from "next";
import "@/components/preview-refonte/maison.css";
import "@/components/preview-refonte/recits.css";

export const viewport: Viewport = {
  themeColor: "#0B192C",
};

export const metadata: Metadata = {
  title: {
    default: "Travel BA",
    template: "%s — Travel BA",
  },
  description:
    "Étude de la refonte Travel BA. Voyages, hôtels, vols, jets, séminaires, ski, accueil, formalités, carnet et conciergerie. Page non indexée.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PreviewRefonteLayout({ children }: { children: React.ReactNode }) {
  return <div className="tba-maison admin-af">{children}</div>;
}
