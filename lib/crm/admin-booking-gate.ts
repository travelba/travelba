import { cache } from "react";
import { requireStaffPage } from "@/lib/crm/auth";
import type { CrmBooking } from "@/lib/crm/types";

/** Une lecture du dossier, partagée entre le titre et la page. Pas de réparation, pas de second aller-retour. */
export const loadAdminBookingGate = cache(async (id: string) => {
  const ctx = await requireStaffPage();
  const { data } = await ctx.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  return { ...ctx, booking: (data as CrmBooking | null) ?? null };
});
