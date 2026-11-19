import type { SupabaseClient } from "@supabase/supabase-js";
import {
  suggestDirectory,
  type DirectoryBookingRow,
  type DirectoryCompanion,
  type DirectoryCompany,
  type DirectoryCustomer,
  type DirectoryTraveler,
} from "./directory-search";

const SCAN_LIMIT = 2000;

type ScanClient = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (count: number) => PromiseLike<{ data: unknown; error: { message?: string | null } | null }>;
    };
  };
};

async function readTable(supabase: ScanClient, table: string, columns: string) {
  const { data, error } = await supabase.from(table).select(columns).limit(SCAN_LIMIT);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/**
 * Même classement que `crm_omnibar_suggest` v2, lu table par table.
 * Sert tant que la migration `20261119143000_omnibar_rank.sql` n’est pas jouée.
 */
export async function scanDirectory(supabase: ScanClient | SupabaseClient, query: string, limit = 20) {
  const client = supabase as ScanClient;
  const [customers, companies, companions, bookings, travelers] = await Promise.all([
    readTable(
      client,
      "crm_customers",
      "id, first_name, last_name, usage_name, company_name, email, phone, phone_secondary, siret"
    ),
    readTable(client, "crm_billing_companies", "customer_id, company_name, siret"),
    readTable(client, "crm_travel_companions", "id, customer_id, first_name, last_name, usage_name, relationship"),
    readTable(client, "crm_bookings", "id, reference, title, destination, customer_id, start_date, end_date, archived_at"),
    readTable(client, "crm_booking_travelers", "id, booking_id, first_name, last_name, is_account_holder"),
  ]);

  return suggestDirectory(
    {
      customers: (customers as Record<string, unknown>[]).map(
        (row): DirectoryCustomer => ({
          id: text(row.id),
          first_name: text(row.first_name),
          last_name: text(row.last_name),
          usage_name: text(row.usage_name),
          company_name: text(row.company_name),
          email: text(row.email),
          phone: text(row.phone),
          phone_secondary: text(row.phone_secondary),
        })
      ),
      companies: (companies as Record<string, unknown>[]).map(
        (row): DirectoryCompany => ({
          customer_id: text(row.customer_id),
          company_name: text(row.company_name),
          siret: text(row.siret),
        })
      ),
      companions: (companions as Record<string, unknown>[]).map(
        (row): DirectoryCompanion => ({
          id: text(row.id),
          customer_id: text(row.customer_id),
          first_name: text(row.first_name),
          last_name: text(row.last_name),
          usage_name: text(row.usage_name),
          relationship: text(row.relationship),
        })
      ),
      bookings: (bookings as Record<string, unknown>[]).map(
        (row): DirectoryBookingRow => ({
          id: text(row.id),
          reference: text(row.reference),
          title: text(row.title),
          destination: text(row.destination),
          customer_id: text(row.customer_id),
          start_date: text(row.start_date),
          end_date: text(row.end_date),
          archived_at: text(row.archived_at) || null,
        })
      ),
      travelers: (travelers as Record<string, unknown>[]).map(
        (row): DirectoryTraveler => ({
          id: text(row.id),
          booking_id: text(row.booking_id),
          first_name: text(row.first_name),
          last_name: text(row.last_name),
          is_account_holder: row.is_account_holder === true,
        })
      ),
    },
    query,
    limit
  );
}
