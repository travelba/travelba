import { Playfair_Display } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});

/** Typographie de la présentation : Playfair pour les titres, Plus Jakarta déjà chargé pour le texte. */
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} min-h-screen`}>{children}</div>;
}
