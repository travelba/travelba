import type { Metadata } from "next";
import { ContactForm } from "@/components/vitrine/ContactForm";

export const metadata: Metadata = {
  title: "Demander un devis",
  description: "Demander un itinéraire ou un voyage à Travel BA. Étude non indexée.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ContactPage({ searchParams }: Props) {
  const query = await searchParams;
  const titre = one(query.titre);
  const voyage = one(query.voyage);
  const intention = one(query.intention) || "projet";
  const heading =
    intention === "itineraire" ? "Demander cet itinéraire" : intention === "personnaliser" ? "Le personnaliser" : "Demander un devis";

  return (
    <article className="vz-section vz-narrow" style={{ paddingTop: "8rem" }}>
      <p className="vz-kicker">Travel BA</p>
      <h1>{heading}</h1>
      <p className="vz-lede">
        {titre ? `${titre}. ` : ""}
        Dates, personnes, motif. La demande part sur WhatsApp ou par e-mail.
      </p>
      <ContactForm intention={intention} voyage={voyage} titre={titre} />
      <p className="vz-actions">
        <a className="vz-link" href="tel:+33772158257">
          Appeler
        </a>
      </p>
      <p className="vz-trust">IATA 20291655 · Atout France IM092260002 · APST n°43865</p>
    </article>
  );
}
