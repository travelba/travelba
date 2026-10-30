import { redirect } from "next/navigation";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";
import { boiteHref, LEGACY_BOITE_ROUTES } from "@/lib/crm/boite-tabs";

/** Ancienne page : l’onglet de la Boîte de réception la remplace. La requête est conservée. */
export default async function LegacyPage({ searchParams }: { searchParams: Promise<Record<string, SearchParamValue>> }) {
  const params = await searchParams;
  const target = LEGACY_BOITE_ROUTES["/admin/hotels-demandes"];
  const kept: Record<string, string | null | undefined> = { ...target.params };
  for (const [key, value] of Object.entries(params)) if (key !== "onglet") kept[key] = firstParam(value);
  redirect(boiteHref(target.tab, kept));
}
