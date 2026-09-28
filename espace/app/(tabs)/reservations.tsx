import { useEffect, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api";
import { readCache, writeCache } from "../../src/offline";
import { Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";

type Trip = { reference: string; title: string; place: string | null; dates: string; countdown: string | null; status: string };
type List = { upcoming: Trip[]; past: Trip[] };

export default function ReservationsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readCache<List>("bookings").then((cached) => cached && setList(cached));
    api<List>("/api/client/espace/bookings")
      .then((data) => {
        setList(data);
        writeCache("bookings", data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const rows = tab === "upcoming" ? list?.upcoming || [] : list?.past || [];

  return (
    <Screen>
      <Kicker>Mon espace voyage</Kicker>
      <Title>Mes réservations</Title>
      <Muted>Itinéraires publiés par l’agence, billets et vouchers du dossier.</Muted>
      <Pressable onPress={() => setTab(tab === "upcoming" ? "past" : "upcoming")}>
        <Kicker>{tab === "upcoming" ? "À venir · voir les passés" : "Passés · voir les à venir"}</Kicker>
      </Pressable>
      <ErrorText>{error}</ErrorText>
      <ScrollView>
        {rows.map((trip) => (
          <Pressable key={trip.reference} onPress={() => router.push(`/reservation/${trip.reference}`)}>
            <Card>
              <Kicker>{trip.status}</Kicker>
              <Title>{trip.title}</Title>
              <Muted>{[trip.dates, trip.place, trip.countdown].filter(Boolean).join(" · ")}</Muted>
            </Card>
          </Pressable>
        ))}
        {!rows.length ? (
          <Card>
            <Muted>
              {tab === "upcoming"
                ? "Aucun séjour à venir. L’agence publiera le carnet ici."
                : "Aucun séjour passé pour le moment."}
            </Muted>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
