import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === "en" ? "Support" : "Assistance";
  return { title: `${title} — ${siteConfig.name}` };
}

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const english = locale === "en";
  return (
    <main className="relative mx-auto min-h-screen max-w-3xl px-5 py-20 sm:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {english ? "Back to the home page" : "Retour à l’accueil"}
      </Link>
      <h1 className="mt-8 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {english ? "Support" : "Assistance"}
      </h1>
      <p className="mt-4 leading-relaxed text-muted">
        {english
          ? "Write to the agency. We reply on business days."
          : "Écrivez à l’agence. Nous répondons les jours ouvrés."}
      </p>
      <p className="mt-6">
        <a className="text-lg font-semibold text-foreground underline" href={`mailto:${siteConfig.contactEmail}`}>
          {siteConfig.contactEmail}
        </a>
      </p>
      <p className="mt-6 text-sm text-muted">
        <Link href="/confidentialite" className="underline">
          {english ? "Privacy policy" : "Politique de confidentialité"}
        </Link>
      </p>
    </main>
  );
}
