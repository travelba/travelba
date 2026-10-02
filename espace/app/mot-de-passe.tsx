import { useState } from "react";
import { useRouter } from "expo-router";
import { Button, ErrorText, Field, Kicker, Screen, Title } from "../src/ui";
import { api } from "../src/api";
import { refreshSession } from "../src/session";
import { routeAfterLink } from "../src/deep-links";

export default function MotDePasseScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/client/password", {
        method: "POST",
        body: JSON.stringify({ password, confirm: password }),
      });
      const session = await refreshSession();
      router.replace(routeAfterLink(session?.snapshot?.next || "/mon-compte/bienvenue") as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mot de passe impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Kicker>Sécurité</Kicker>
      <Title>Choisissez un mot de passe</Title>
      <Field label="Mot de passe" value={password} onChangeText={setPassword} secure />
      <ErrorText>{error}</ErrorText>
      <Button label="Enregistrer" onPress={submit} busy={busy} />
    </Screen>
  );
}
