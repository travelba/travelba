import { redirect } from "next/navigation";

const TABS: Record<string, string> = {
  "a-encaisser": "/admin/revolut",
  "a-pointer": "/admin/comptabilite",
  "grand-livre": "/admin/transactions",
  comptes: "/admin/revolut",
};

/** Argent : en attendant la page à onglets, chaque onglet ouvre la page d’aujourd’hui. */
export default async function ArgentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = params.onglet;
  const onglet = (Array.isArray(raw) ? raw[0] : raw) || "a-encaisser";
  redirect(TABS[onglet] || TABS["a-encaisser"]);
}
