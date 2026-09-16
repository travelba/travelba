import { Inter, Plus_Jakarta_Sans } from "next/font/google";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function PublicQuoteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`account-app min-h-screen ${display.variable} ${sans.variable}`}>
      {children}
    </div>
  );
}
