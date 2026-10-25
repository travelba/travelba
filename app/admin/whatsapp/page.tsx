import { redirect } from "next/navigation";
import { dockDiscussionsHref, parseInboxFilter } from "@/lib/crm/whatsapp-inbox";

/** Les fils vivent dans la barre de droite. Cette adresse ouvre la barre, filtrée. */
export default async function WhatsappInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ fil?: string; filtre?: string; vue?: string }>;
}) {
  const params = await searchParams;
  const focus = params.vue === "valider" ? "envoyer" : parseInboxFilter(params.filtre);
  redirect(dockDiscussionsHref(focus, params.fil));
}
