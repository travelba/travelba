import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "@/components/preview-refonte/maison.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-tba-serif",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-tba-sans",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#12110f",
};

export const metadata: Metadata = {
  title: {
    default: "Travel BA — Maison de voyage",
    template: "%s — Travel BA",
  },
  description:
    "Aperçu de la refonte du site Travel BA. Voyages sur-mesure, séminaires et ski premium. Page non indexée.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PreviewRefonteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`tba-maison ${serif.variable} ${sans.variable}`}>{children}</div>;
}
