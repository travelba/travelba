import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { Shell } from "@/components/vitrine/Shell";
import { signatureMenu } from "@/lib/vitrine/destinations";
import "@/components/vitrine/vitrine.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-vitrine-serif",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0B192C",
};

export const metadata: Metadata = {
  title: {
    default: "Travel BA",
    template: "%s — Travel BA",
  },
  description:
    "Étude de la refonte Travel BA. Club, voyages signature, Kids, séminaires, déplacements, application. Page non indexée.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PreviewRefonteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`vz ${serif.variable}`}>
      <Shell signature={signatureMenu()}>{children}</Shell>
    </div>
  );
}
