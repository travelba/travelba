import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ClubAdmin } from "@/components/maquette/club-admin";
import { adminPublicPath, findAdmin } from "@/lib/crm/club-maquette";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const found = findAdmin(adminPublicPath(slug));
  return { title: found?.title || "Club", robots: { index: false, follow: false } };
}

export default async function ClubAdminMaquettePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  if (!exampleSessionEnabled()) notFound();
  const { slug } = await params;
  const path = adminPublicPath(slug);
  const found = findAdmin(path);
  if (!found) notFound();
  return (
    <Suspense fallback={null}>
      <ClubAdmin path={path} screen={found.id} />
    </Suspense>
  );
}
