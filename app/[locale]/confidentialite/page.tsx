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
  const title = locale === "en" ? "Privacy policy" : "Politique de confidentialité";
  return { title: `${title} — ${siteConfig.name}`, robots: { index: true, follow: true } };
}

export default async function PrivacyPage({
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
        {english ? "Privacy policy" : "Politique de confidentialité"}
      </h1>
      <p className="mt-4 leading-relaxed text-muted">
        {english
          ? "This policy covers the website travelba.fr, the client portal, and the TBA iOS app."
          : "Cette politique couvre le site travelba.fr, l’espace client et l’application iOS TBA."}
      </p>
      <PrivacyBody english={english} />
    </main>
  );
}

function PrivacyBody({ english }: { english: boolean }) {
  const { legal, address, contactEmail } = siteConfig;
  if (english) {
    return (
      <div className="mt-10 space-y-8 leading-relaxed text-muted">
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground">Controller</h2>
          <p className="mt-3">
            {legal.legalName} {legal.legalForm}, {address.full}. SIREN {legal.siren}. Contact: {contactEmail}.
          </p>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground">Data we collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Identity and contact details: name, email, phone, billing address.</li>
            <li>Passport and identity documents you or the agency upload.</li>
            <li>Travel bookings published in your account: cities, dates, services, files.</li>
            <li>Payments handled by Stripe. We do not store the card number.</li>
            <li>The notification token of the iOS app, so we can send trip alerts.</li>
            <li>Face ID is checked on the device only. The result is never sent to us.</li>
            <li>Camera and photo library are used only when you choose to photograph or import a document.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground">Purposes and legal bases</h2>
          <p className="mt-3">
            We use this data to perform the travel contract, to meet legal duties (invoicing, identity for tickets), and,
            for the app notifications you can switch off, on the basis of that contract and your settings. We do not sell data
            and we do not use it for advertising.
          </p>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground">Retention</h2>
          <p className="mt-3">
            Account data is kept for the business relationship. Deleting the account removes the login, the profile, identity
            documents and registered devices immediately. Bookings, invoices and payments stay for the legal retention periods
            (accounting, ten years; the travel contract), without the account.
          </p>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground">Processors</h2>
          <p className="mt-3">
            Supabase (database, European Union), Vercel (hosting), Stripe (card payments), Apple Push Notification service
            (delivery of alerts to the iOS app). Each acts on our instructions for the service described.
          </p>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground">Your rights</h2>
          <p className="mt-3">
            You may access, correct, delete, limit or object to the use of your data, and lodge a complaint with the CNIL
            (cnil.fr). Write to {contactEmail}. In the app, Mon compte includes “Supprimer mon compte”. The account is deleted
            immediately. Bookings, invoices and payments that the law requires us to keep remain with the agency.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className="mt-10 space-y-8 leading-relaxed text-muted">
      <section>
        <h2 className="font-display text-xl font-semibold text-foreground">Responsable</h2>
        <p className="mt-3">
          {legal.legalName} {legal.legalForm}, {address.full}. SIREN {legal.siren}. Contact : {contactEmail}.
        </p>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold text-foreground">Données collectées</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Identité et contact : nom, e-mail, téléphone, adresse de facturation.</li>
          <li>Passeport et pièces d’identité que vous ou l’agence déposez.</li>
          <li>Réservations publiées dans l’espace : villes, dates, prestations, fichiers.</li>
          <li>Règlements traités par Stripe. Le numéro de carte n’est pas stocké.</li>
          <li>Le jeton de notification de l’application iOS, pour les alertes de voyage.</li>
          <li>Face ID est vérifié sur l’appareil seulement. Le résultat n’est jamais transmis.</li>
          <li>L’appareil photo et les photos ne servent que si vous photographiez ou importez une pièce.</li>
        </ul>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold text-foreground">Finalités et bases</h2>
        <p className="mt-3">
          Ces données servent à exécuter le contrat de voyage, à respecter les obligations légales (facture, identité pour
          les billets) et, pour les notifications que vous pouvez couper dans l’application, au contrat et à vos réglages.
          Aucune vente de données, aucun usage publicitaire.
        </p>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold text-foreground">Durée</h2>
        <p className="mt-3">
          Les données du compte sont gardées le temps de la relation. Supprimer le compte retire tout de suite la connexion,
          le profil, les pièces d’identité et les appareils enregistrés. Les dossiers, les factures et les règlements restent
          le temps des obligations légales (comptabilité, dix ans ; contrat de voyage), sans le compte.
        </p>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold text-foreground">Sous-traitants</h2>
        <p className="mt-3">
          Supabase (base de données, Union européenne), Vercel (hébergement), Stripe (paiement par carte), Apple Push
          Notification service (remise des alertes de l’application iOS). Chacun agit pour le service indiqué.
        </p>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold text-foreground">Vos droits</h2>
        <p className="mt-3">
          Vous pouvez accéder à vos données, les rectifier, les effacer, en limiter l’usage, vous y opposer, et saisir la
          CNIL (cnil.fr). Écrivez à {contactEmail}. Dans l’application, Mon compte propose « Supprimer mon compte ». Le compte
          est effacé tout de suite. Les dossiers, les factures et les règlements que la loi impose de garder restent à l’agence.
        </p>
      </section>
    </div>
  );
}
