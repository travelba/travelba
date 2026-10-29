import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";

const sans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Configurateur Argentine · Travelba",
  description:
    "Composez un séjour de 19 jours en Argentine, juillet–août, pour deux adultes. Hébergement, activité et transfert, total en dollars.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${sans.className} ${serif.variable} antialiased`}>{children}</body>
    </html>
  );
}
