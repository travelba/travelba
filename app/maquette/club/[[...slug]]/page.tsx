import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ClubMember } from "@/components/maquette/club-member";
import { clubScreenById, findMember, memberPath } from "@/lib/crm/club-maquette";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const found = findMember(memberPath(slug));
  const title = found?.id === "index" ? "Club Travel BA" : clubScreenById(found?.id || "")?.title || "Maquette";
  return { title, robots: { index: false, follow: false } };
}

export default async function ClubMaquettePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  if (!exampleSessionEnabled()) notFound();
  const { slug } = await params;
  const path = memberPath(slug);
  const found = findMember(path);
  if (!found) notFound();
  return (
    <Suspense fallback={null}>
      <ClubMember path={path} screen={found.id} hotelSlug={found.hotelSlug} />
    </Suspense>
  );
}
