import { useState } from "react";
import { useRouter } from "expo-router";
import { Button, Card, Kicker, Muted, Screen, Title } from "../src/ui";
import { api } from "../src/api";

const STEPS = [
  {
    title: "Le carnet publié",
    body: "L’agence publie votre séjour lorsqu’il est prêt. Vous le retrouvez dans Réservations.",
  },
  {
    title: "Ce qui est comptabilisé",
    body: "Transactions n’affiche que les écritures déjà passées au grand livre.",
  },
  {
    title: "Votre fiche",
    body: "Mon compte réunit Vous, Pièces, Voyageurs et Facturation.",
  },
];

export default function BienvenueScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    try {
      await api("/api/client/onboarding", { method: "POST", body: JSON.stringify({}) });
    } catch {
      /* on ouvre quand même l’accueil */
    }
    router.replace("/");
    setBusy(false);
  }

  return (
    <Screen>
      <Kicker>Bienvenue</Kicker>
      <Title>Votre espace TBA</Title>
      {STEPS.map((step) => (
        <Card key={step.title}>
          <Kicker>{step.title}</Kicker>
          <Muted>{step.body}</Muted>
        </Card>
      ))}
      <Button label="Entrer dans l’espace" onPress={finish} busy={busy} />
    </Screen>
  );
}
