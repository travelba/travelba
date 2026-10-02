import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api } from "../../src/api";
import { addStayToCalendar } from "../../src/calendar";
import { loadWalletPass } from "../../src/wallet";
import { Button, Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";

type Detail = {
  trip: { title: string; place: string | null; dates: string; reference: string };
  timeline: { id: string; kind: string; title: string; subtitle: string | null; clock: string | null; day: string }[];
  documents: { id: string; name: string; path: string | null }[];
  calendar: { id: string; title: string; notes: string; start: string; end: string | null; allDay: boolean }[];
  wallet: { itemId: string }[];
  modify: string;
};

export default function ReservationScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reference) return;
    api<Detail>(`/api/client/espace/bookings/${reference}`)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [reference]);

  async function addCalendar() {
    if (!detail?.calendar.length) return;
    setBusy(true);
    try {
      await addStayToCalendar(detail.calendar);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calendrier impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function addWallet() {
    const itemId = detail?.wallet[0]?.itemId;
    if (!itemId) return;
    setBusy(true);
    try {
      await loadWalletPass(itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet indisponible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ErrorText>{error}</ErrorText>
      <Kicker>{detail?.trip.dates}</Kicker>
      <Title>{detail?.trip.title || "Séjour"}</Title>
      {detail?.trip.place ? <Muted>{detail.trip.place}</Muted> : null}
      <Button label="Ajouter le séjour au calendrier" onPress={addCalendar} busy={busy} />
      {detail?.wallet.length ? <Button label="Carte d’embarquement" onPress={addWallet} busy={busy} /> : null}
      <ScrollView>
        {(detail?.timeline || []).map((item) => (
          <Card key={item.id}>
            <Kicker>{item.kind}</Kicker>
            <Title>{item.title}</Title>
            <Muted>{[item.subtitle, item.clock, item.day].filter(Boolean).join(" · ")}</Muted>
          </Card>
        ))}
        {(detail?.documents || []).map((doc) => (
          <Card key={doc.id}>
            <Muted>{doc.name}</Muted>
          </Card>
        ))}
      </ScrollView>
      {detail?.modify ? (
        <Pressable onPress={() => Linking.openURL(detail.modify)}>
          <Muted>Modifier ce séjour — écrire à l’agence</Muted>
        </Pressable>
      ) : null}
    </Screen>
  );
}
