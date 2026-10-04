import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, siteUrl } from "../../src/api";
import { getTokens } from "../../src/session";
import { Button, Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";

type Doc = { id: string; first_name?: string | null; last_name?: string | null; document_number?: string | null; expires_on?: string | null };

export default function PiecesScreen() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api<{ documents: Doc[] }>("/api/client/documents");
    setDocs(data.documents || []);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const photo = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
      if (photo.canceled || !photo.assets[0]) return;
      const tokens = await getTokens();
      const form = new FormData();
      form.append("file", {
        uri: photo.assets[0].uri,
        name: "passeport.jpg",
        type: "image/jpeg",
      } as never);
      const response = await fetch(`${siteUrl()}/api/client/documents`, {
        method: "POST",
        headers: tokens?.access_token ? { Authorization: `Bearer ${tokens.access_token}` } : undefined,
        body: form,
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || "Lecture impossible");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Kicker>Pièces</Kicker>
      <Title>Passeports</Title>
      <Muted>Photographiez le livret. L’agence relit avant de s’en servir.</Muted>
      <ErrorText>{error}</ErrorText>
      <Button label="Photographier une pièce" onPress={scan} busy={busy} />
      <ScrollView>
        {docs.map((doc) => (
          <Card key={doc.id}>
            <Title>{[doc.first_name, doc.last_name].filter(Boolean).join(" ") || "Pièce"}</Title>
            <Muted>{[doc.document_number, doc.expires_on].filter(Boolean).join(" · ")}</Muted>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
