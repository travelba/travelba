import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { api } from "../../src/api";
import { Card, ErrorText, Kicker, Muted, Screen, Title } from "../../src/ui";

type Company = { id: string; company_name: string | null; siret: string | null };

export default function FacturationScreen() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ billing_companies: Company[] }>("/api/client/profile")
      .then((data) => setCompanies(data.billing_companies || []))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <Screen>
      <Kicker>Facturation</Kicker>
      <Title>Sociétés</Title>
      <ErrorText>{error}</ErrorText>
      <ScrollView>
        {companies.map((row) => (
          <Card key={row.id}>
            <Title>{row.company_name || "Société"}</Title>
            {row.siret ? <Muted>{row.siret}</Muted> : null}
          </Card>
        ))}
        {!companies.length ? <Muted>Aucune société. Écrivez à l’agence pour en ajouter une.</Muted> : null}
      </ScrollView>
    </Screen>
  );
}
