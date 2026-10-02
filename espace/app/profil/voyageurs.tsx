import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { api } from "../../src/api";
import { Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";

type Companion = { id: string; first_name: string; last_name: string };

export default function VoyageursScreen() {
  const [rows, setRows] = useState<Companion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ companions: Companion[] }>("/api/client/companions")
      .then((data) => setRows(data.companions || []))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <Screen>
      <Kicker>Voyageurs</Kicker>
      <Title>Ceux qui partent avec vous</Title>
      <ErrorText>{error}</ErrorText>
      <ScrollView>
        {rows.map((row) => (
          <Card key={row.id}>
            <Title>
              {row.first_name} {row.last_name}
            </Title>
          </Card>
        ))}
        {!rows.length ? <Muted>Aucun accompagnateur pour le moment.</Muted> : null}
      </ScrollView>
    </Screen>
  );
}
