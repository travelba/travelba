import { notFound } from "next/navigation";
import { RefonteDossier } from "@/components/admin/refonte/RefonteDossier";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";
import { dossierTab } from "@/lib/crm/refonte-preview";

export const metadata = { title: "Dossier" };

export default async function RefonteDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const onglet = Array.isArray(query.onglet) ? query.onglet[0] : query.onglet;
  const snapshot = await loadRefonteSnapshot();
  const dossier = snapshot.dossiers.find((row) => row.id === id);
  if (!dossier) notFound();
  return <RefonteDossier dossier={dossier} tab={dossierTab(onglet)} />;
}
