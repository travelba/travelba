import { redirect } from "next/navigation";
import { dossiersHref, LEGACY_DOSSIERS_ROUTES } from "@/lib/crm/dossiers-views";

/** Ancienne page : Services à confirmer est une vue de Dossiers. */
export default function LegacyServicesPage() {
  redirect(dossiersHref(LEGACY_DOSSIERS_ROUTES["/admin/services"]));
}
