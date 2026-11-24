import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Travel Club TBA",
  robots: { index: false, follow: false },
};

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return <div className="invite-root relative min-h-dvh overflow-x-clip">{children}</div>;
}
