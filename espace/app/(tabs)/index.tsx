import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { api, fileUrl } from "../../src/api";
import { readCache, writeCache } from "../../src/offline";
import { writeWidgetSnapshot } from "../../src/widget";
import { Button, Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";
import { colors } from "../../src/theme";

type Home = {
  greeting: string;
  member: boolean;
  balances: { label: string; caption: string; value: number }[];
  nextTrip: { title: string; place: string | null; dates: string; countdown: string | null; cover: string | null; reference: string } | null;
  homeFlight: { airline: string; number: string; time: string | null; airports: string | null; itemId: string } | null;
  whatsapp: string;
};

export default function AccueilScreen() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readCache<Home>("home").then((cached) => {
      if (cached) setHome(cached);
    });
    api<Home>("/api/client/espace")
      .then((data) => {
        setHome(data);
        writeCache("home", data);
        writeWidgetSnapshot((data as Home & { widget?: unknown }).widget);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!home) {
    return (
      <Screen>
        <Title>Espace TBA</Title>
        <ErrorText>{error}</ErrorText>
      </Screen>
    );
  }

  const owing = home.balances.filter((row) => row.value < 0);

  return (
    <Screen>
      <ScrollView>
        <Kicker>Travel Business Agency · Espace membre</Kicker>
        <Title>Bonjour {home.greeting}</Title>
        {home.member ? (
          <Pressable onPress={() => router.push("/transactions")}>
            <Card>
              <Muted>Voir les frais de vos voyages</Muted>
            </Card>
          </Pressable>
        ) : owing.length ? (
          <Pressable onPress={() => router.push("/transactions")}>
            <Card>
              <Kicker>Encours</Kicker>
              {owing.map((row) => (
                <Title key={row.label}>{row.label}</Title>
              ))}
              <Muted>{owing[0]?.caption}</Muted>
            </Card>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push("/transactions")}>
            <Muted>Voir les transactions</Muted>
          </Pressable>
        )}
        {home.nextTrip ? (
          <Pressable onPress={() => router.push(`/reservation/${home.nextTrip!.reference}`)}>
            <Card>
              {home.nextTrip.cover ? (
                <Image
                  source={{ uri: fileUrl(home.nextTrip.cover) || undefined }}
                  style={{ height: 180, borderRadius: 14, marginBottom: 12, backgroundColor: colors.navy }}
                />
              ) : null}
              <Kicker>{home.nextTrip.dates}</Kicker>
              <Title>{home.nextTrip.title}</Title>
              {home.nextTrip.place ? <Muted>{home.nextTrip.place}</Muted> : null}
              {home.nextTrip.countdown ? <Muted>{home.nextTrip.countdown}</Muted> : null}
            </Card>
          </Pressable>
        ) : (
          <Card>
            <Title>Aucun voyage planifié</Title>
            <Muted>L’agence publiera le carnet ici dès que le dossier sera prêt.</Muted>
          </Card>
        )}
        {home.homeFlight ? (
          <Card>
            <Kicker>Carte d’embarquement</Kicker>
            <Title>
              {home.homeFlight.airline} {home.homeFlight.number}
            </Title>
            <Muted>
              {[home.homeFlight.airports, home.homeFlight.time].filter(Boolean).join(" · ")}
            </Muted>
          </Card>
        ) : null}
        <Button label="Écrire à l’agence" onPress={() => Linking.openURL(home.whatsapp)} />
      </ScrollView>
    </Screen>
  );
}
