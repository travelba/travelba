import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { api } from "../../src/api";
import { Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";

type View = {
  member: boolean;
  currency: string;
  balanceValue: number;
  remaining: number;
  movements: { id: string; title?: string; amount?: number; currency?: string; when?: string }[];
};

export default function TransactionsScreen() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<View>("/api/client/espace/transactions")
      .then(setView)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <Screen>
      <Kicker>Grand livre</Kicker>
      <Title>Transactions</Title>
      <ErrorText>{error}</ErrorText>
      {view ? (
        <Card>
          <Kicker>{view.member ? "Frais de vos voyages" : "Encours"}</Kicker>
          <Title>
            {view.balanceValue.toLocaleString("fr-FR", { style: "currency", currency: view.currency || "EUR" })}
          </Title>
        </Card>
      ) : null}
      <ScrollView>
        {(view?.movements || []).map((row) => (
          <Card key={row.id}>
            <Title>{row.title || "Écriture"}</Title>
            <Muted>
              {[row.when, row.amount != null ? String(row.amount) : ""].filter(Boolean).join(" · ")}
            </Muted>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
