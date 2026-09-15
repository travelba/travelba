import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DossierWorkspace } from "@/components/admin/DossierWorkspace";
import type {
  AgencyBooking,
  AgencyDossier,
  AgencyDossierHotel,
  AgencyHotelContact,
  AgencyPaymentFollowup,
  AgencyQuote,
} from "@/lib/agency/types";
export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: dossier } = await supabase
    .from("agency_dossiers")
    .select("*, agency_clients(*)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!dossier) notFound();

  const [hotels, quotes, bookings, followups, contacts] = await Promise.all([
    supabase
      .from("agency_dossier_hotels")
      .select("*")
      .eq("dossier_id", id)
      .order("lowest_rate", { ascending: true }),
    supabase
      .from("agency_quotes")
      .select("*")
      .eq("dossier_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_bookings")
      .select("*")
      .eq("dossier_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_payment_followups")
      .select("*")
      .eq("dossier_id", id)
      .order("created_at", { ascending: false }),
    dossier.hotel_id
      ? supabase
          .from("agency_hotel_contacts")
          .select("*")
          .eq("user_id", user!.id)
          .eq("le_hotel_id", dossier.hotel_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const widgetBase = (
    process.env.LITTLE_EMPERORS_WIDGET_URL ||
    "https://api-staging.littleemperors.com"
  ).replace(/\/$/, "");

  return (
    <DossierWorkspace
      initialDossier={dossier as AgencyDossier}
      initialHotels={(hotels.data || []) as AgencyDossierHotel[]}
      initialQuotes={(quotes.data || []) as AgencyQuote[]}
      initialBookings={(bookings.data || []) as AgencyBooking[]}
      initialFollowups={(followups.data || []) as AgencyPaymentFollowup[]}
      initialContact={(contacts.data || null) as AgencyHotelContact | null}
      widgetBaseUrl={widgetBase}
    />
  );
}
