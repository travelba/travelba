import { redirect } from "next/navigation";
import { dossiersHref, LEGACY_DOSSIERS_ROUTES } from "@/lib/crm/dossiers-views";

/** Ancienne page : Formalités est une vue de Dossiers. */
export default function LegacyFormalitesPage() {
  redirect(dossiersHref(LEGACY_DOSSIERS_ROUTES["/admin/formalites"]));
}
