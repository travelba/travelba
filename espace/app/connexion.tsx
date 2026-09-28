import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Button, ErrorText, Field, Kicker, Screen, Title } from "../src/ui";
import { signInWithPassword } from "../src/session";
import { api } from "../src/api";
import { routeAfterLink } from "../src/deep-links";

export default function ConnexionScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magic, setMagic] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithPassword(email.trim(), password);
      router.replace(routeAfterLink(result.snapshot?.next || "/mon-compte") as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Identifiants incorrects.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMagic() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/otp", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setMagic("Si ce compte existe, le lien arrive par e-mail.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Kicker>Travel Business Agency</Kicker>
        <Title>Votre espace</Title>
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secure />
        <ErrorText>{error}</ErrorText>
        {magic ? <ErrorText>{magic}</ErrorText> : null}
        <Button label="Entrer" onPress={submit} busy={busy} />
        <Button label="Recevoir un lien magique" onPress={sendMagic} busy={busy} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
