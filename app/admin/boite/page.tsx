import { redirect } from "next/navigation";

const TABS: Record<string, string> = {
  fournisseurs: "/admin/emails",
  hotels: "/admin/emails?vue=reponses",
  whatsapp: "/admin/whatsapp",
};

/** Boîte de réception : en attendant la page à onglets, chaque onglet ouvre la file d’aujourd’hui. */
export default async function BoitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = params.onglet;
  const onglet = (Array.isArray(raw) ? raw[0] : raw) || "fournisseurs";
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  if (onglet === "fournisseurs" && source === "little-emperors") redirect("/admin/little-emperors");
  const filtre = Array.isArray(params.filtre) ? params.filtre[0] : params.filtre;
  const target = TABS[onglet] || TABS.fournisseurs;
  redirect(filtre ? `${target}${target.includes("?") ? "&" : "?"}filtre=${encodeURIComponent(filtre)}` : target);
}
