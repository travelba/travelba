import type { Metadata } from "next";
import { ContactForm } from "@/components/vitrine/ContactForm";

export const metadata: Metadata = {
  title: "Écrire à la maison",
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
    intention === "itineraire" ? "Demander cet itinéraire" : intention === "personnaliser" ? "Le personnaliser" : "Écrire à la maison";

  return (
    <article className="vz-section vz-narrow" style={{ paddingTop: "8rem" }}>
      <p className="vz-kicker">Travel BA</p>
      <h1>{heading}</h1>
      <p className="vz-lede">
        {titre
          ? `${titre}. La demande part vers WhatsApp ou votre messagerie. Cette étude ne l’enregistre pas.`
          : "Quelques lignes suffisent. La demande part vers WhatsApp ou votre messagerie. Cette étude ne l’enregistre pas."}
      </p>
      <ContactForm intention={intention} voyage={voyage} titre={titre} />
    </article>
  );
}
