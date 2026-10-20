"use client";

import { MobileTabBar } from "@/components/admin/AdminNavParts";
import { EMPTY_NAV_COUNTS } from "@/lib/crm/admin-nav";

/** Barre basse de l’aperçu, pour vérifier que la bulle ne la recouvre pas. */
export function PreviewMobileBar() {
  return <MobileTabBar pathname="/admin/reservations" counts={EMPTY_NAV_COUNTS} moreOpen={false} onMore={() => undefined} />;
}
