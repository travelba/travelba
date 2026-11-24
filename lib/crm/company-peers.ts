import { cache } from "react";
import { bookingIdsWhereClientTravels, collaboratorTripOwnerIds, type ClientBookingScope } from "@/lib/crm/company-role";
import { twinIdsOf } from "@/lib/crm/customer-twins";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer } from "@/lib/crm/types";

type PeerCustomer = Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id"> &
  Partial<Pick<CrmCustomer, "first_name" | "last_name" | "usage_name">>;

/** Titulaires dont l’espace lit les dossiers : soi et les jumeaux. Pas les collaborateurs. */
export function mergeTripOwnerIds(base: string[], twins: string[]) {
  return [...new Set([...base, ...twins].filter(Boolean))];
}

const twinIdsCached = cache(async (customerId: string) => {
  try {
    return await twinIdsOf(createServiceClient(), customerId);
  } catch {
    return [] as string[];
  }
});

/** Espace client : soi et les jumeaux. Le voyage d’un collaborateur n’y entre pas. */
export async function clientTripOwnerIds(customer: PeerCustomer) {
  try {
    const twins = await twinIdsCached(customer.id);
    return mergeTripOwnerIds(collaboratorTripOwnerIds(customer), twins);
  } catch {
    return [customer.id];
  }
}

/**
 * Dossiers montrés d’un collaborateur où ce payeur est voyageur.
 * Les autres séjours facturés à la société restent fermés. Repli : aucun.
 */
async function travelerBookingIds(customer: PeerCustomer) {
  if (customer.company_role !== "admin" || !isUuid(customer.id)) return [] as string[];
  const first = (customer.first_name || "").trim();
  const last = (customer.last_name || "").trim();
  const usage = (customer.usage_name || "").trim();
  if (!first || (!last && !usage)) return [] as string[];
  try {
    const admin = createServiceClient();
    const { data: members } = await admin
      .from("crm_customers")
      .select("id")
      .eq("billing_parent_id", customer.id)
      .eq("company_role", "member");
    const memberIds = ((members || []) as { id?: string }[]).map((row) => row.id || "").filter((id) => isUuid(id));
    const billed = admin
      .from("crm_bookings")
      .select("id")
      .eq("billing_customer_id", customer.id)
      .neq("customer_id", customer.id)
      .eq("visible_to_client", true)
      .is("archived_at", null);
    const team = memberIds.length
      ? admin
          .from("crm_bookings")
          .select("id")
          .in("customer_id", memberIds)
          .eq("visible_to_client", true)
          .is("archived_at", null)
      : Promise.resolve({ data: [] as { id: string }[] });
    const [billedRows, teamRows] = await Promise.all([billed, team]);
    const stayIds = [
      ...new Set(
        [...((billedRows.data || []) as { id?: string }[]), ...((teamRows.data || []) as { id?: string }[])]
          .map((row) => row.id || "")
          .filter((id) => isUuid(id))
      ),
    ];
    if (!stayIds.length) return [] as string[];
    const { data: travelers } = await admin
      .from("crm_booking_travelers")
      .select("booking_id, first_name, last_name")
      .in("booking_id", stayIds);
    return bookingIdsWhereClientTravels(
      customer,
      (travelers || []) as { booking_id: string; first_name: string | null; last_name: string | null }[]
    );
  } catch {
    return [] as string[];
  }
}

const bookingScopeCached = cache(async (id: string, role: string, first: string, last: string, usage: string) => {
  const customer: PeerCustomer = {
    id,
    company_role: role === "admin" || role === "member" ? role : null,
    billing_parent_id: null,
    first_name: first,
    last_name: last,
    usage_name: usage,
  };
  const ownerIds = await clientTripOwnerIds(customer);
  const trips = await travelerBookingIds(customer);
  const scope: ClientBookingScope = { ownerIds, travelerBookingIds: trips };
  return scope;
});

/** Périmètre carnet : ses dossiers, ses jumeaux, et les séjours où il voyage. */
export async function clientBookingScope(customer: PeerCustomer): Promise<ClientBookingScope> {
  return bookingScopeCached(
    customer.id,
    customer.company_role || "",
    customer.first_name || "",
    customer.last_name || "",
    customer.usage_name || ""
  );
}

/** Jumeaux directs. Vide si la table n’est pas encore en place. Une fois par requête. */
export async function clientTwinIds(customerId: string) {
  return twinIdsCached(customerId);
}
