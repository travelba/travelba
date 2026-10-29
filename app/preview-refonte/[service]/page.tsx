import { redirect } from "next/navigation";
import { PREVIEW } from "@/lib/vitrine/paths";

const redirects: Record<string, string> = {
  ski: `${PREVIEW}/services/ski`,
  prestige: `${PREVIEW}/services/prestige`,
  "jet-prive": `${PREVIEW}/services/jet-prive`,
  evenements: `${PREVIEW}/services/evenements`,
  hotels: `${PREVIEW}/services/hotels`,
  restaurants: `${PREVIEW}/services/restaurants`,
  clubs: `${PREVIEW}/services/clubs`,
  chauffeur: `${PREVIEW}/services/chauffeur`,
  "accueil-vip": `${PREVIEW}/services/accueil-vip`,
  "a-deux": `${PREVIEW}/services/a-deux`,
  celebrations: `${PREVIEW}/services/celebrations`,
  anniversaire: `${PREVIEW}/services/anniversaire`,
  evg: `${PREVIEW}/services/evg`,
  famille: `${PREVIEW}/kids`,
};

type Props = { params: Promise<{ service: string }> };

export function generateStaticParams() {
  return Object.keys(redirects).map((service) => ({ service }));
}

export default async function LegacyServiceRedirect({ params }: Props) {
  const { service } = await params;
  redirect(redirects[service] ?? PREVIEW);
}
