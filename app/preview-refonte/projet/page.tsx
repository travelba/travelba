import type { Metadata } from "next";
import { Frame } from "@/components/preview-refonte/Frame";
import { ProjetForm } from "@/components/preview-refonte/ProjetForm";
import { Credentials } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Votre projet",
  description: "Racontez un projet à Travel BA : qui, quoi, quand, enveloppe. Étude non indexée. Rien n’est envoyé.",
};

export default function ProjetPage() {
  return (
    <Frame>
      <div className="tba-projet-page">
        <p className="tba-kicker">La maison</p>
        <h1>Racontez-nous votre projet.</h1>
        <p>
          Quatre questions. Le récit se prépare ici, dans votre navigateur. Cette étude ne l’envoie pas, et elle ne
          chiffre rien. Pour qu’il parte, le dernier écran ouvre WhatsApp.
        </p>
        <ProjetForm />
      </div>
      <Credentials />
    </Frame>
  );
}
