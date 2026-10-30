import { redirect } from "next/navigation";
import { argentHref } from "@/lib/crm/argent-tabs";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";

/** Ancienne page : l’onglet de `/admin/argent` la remplace. La requête est conservée. */
export default async function LegacyPage({ searchParams }: { searchParams: Promise<Record<string, SearchParamValue>> }) {
  const params = await searchParams;
  const kept: Record<string, string | null | undefined> = {};
  for (const [key, value] of Object.entries(params)) if (key !== "onglet") kept[key] = firstParam(value);
  redirect(argentHref("a-pointer", { ...kept, vue: "pliant" }));
}
