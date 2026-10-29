import { redirect } from "next/navigation";

/** Les anciens liens « Outils » ouvrent Réglages, même sous-page. */
export default async function OutilsRedirect({ params }: { params: Promise<{ rest?: string[] }> }) {
  const { rest } = await params;
  redirect(rest?.length ? `/admin/reglages/${rest.join("/")}` : "/admin/reglages");
}
