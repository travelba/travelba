import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { api } from "../../src/api";
import { siteConfigWhatsapp } from "../../src/whatsapp";
import { clearTokens } from "../../src/session";
import { Button, Card, ErrorText, Field, Kicker, Muted, Screen, Title } from "../../src/ui";

type Profile = {
  customer: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
  };
};

export default function CompteScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Profile>("/api/client/profile")
      .then((data) => {
        setProfile(data);
        setPhone(data.customer.phone || "");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<Profile>("/api/client/profile", {
        method: "PATCH",
        body: JSON.stringify({ phone }),
      });
      setProfile(data.customer ? { customer: data.customer } : profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await clearTokens();
    router.replace("/connexion");
  }

  return (
    <Screen>
      <Kicker>Vous</Kicker>
      <Title>{[profile?.customer.first_name, profile?.customer.last_name].filter(Boolean).join(" ") || "Mon compte"}</Title>
      <Muted>{profile?.customer.email}</Muted>
      <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <ErrorText>{error}</ErrorText>
      <Button label="Enregistrer" onPress={save} busy={busy} />
      <Pressable onPress={() => router.push("/profil/pieces")}>
        <Card>
          <Title>Pièces</Title>
          <Muted>Passeports et documents de voyage.</Muted>
        </Card>
      </Pressable>
      <Pressable onPress={() => router.push("/profil/voyageurs")}>
        <Card>
          <Title>Voyageurs</Title>
          <Muted>Les personnes qui partent avec vous.</Muted>
        </Card>
      </Pressable>
      <Pressable onPress={() => router.push("/profil/facturation")}>
        <Card>
          <Title>Facturation</Title>
          <Muted>La société, lorsqu’elle règle le séjour.</Muted>
        </Card>
      </Pressable>
      <Button label="Écrire à l’agence" onPress={() => Linking.openURL(siteConfigWhatsapp())} />
      <Button label="Déconnexion" onPress={signOut} />
    </Screen>
  );
}
