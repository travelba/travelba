import type { SupabaseClient } from "@supabase/supabase-js";
import {
  estaAlerts,
  estaCoversTrip,
  isEstaStatus,
  passportForEsta,
} from "@/lib/crm/esta";
import { ukEtaAlerts, ukEtaCoversTrip } from "@/lib/crm/uk-eta";
import { isUkEtaStatus } from "@/lib/crm/uk-eta-ui";
import type { PersonName } from "@/lib/crm/person-match";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

type ToneLine = { travelerId: string; tone: string };

/** US ou GB : chaque voyageur du dossier a une autorisation qui couvre le séjour. */
export function settledAuthorizationCountries(input: {
  travelerIds: string[];
  estaTones: ToneLine[];
  ukEtaTones: ToneLine[];
}) {
  const settled: string[] = [];
  if (allCovered(input.travelerIds, input.estaTones)) settled.push("US");
  if (allCovered(input.travelerIds, input.ukEtaTones)) settled.push("GB");
  return settled;
}

function allCovered(travelerIds: string[], lines: ToneLine[]) {
  if (!travelerIds.length || !lines.length) return false;
  return travelerIds.every((id) => lines.find((line) => line.travelerId === id)?.tone === "ok");
}

type EstaRow = {
  traveler_id: string;
  status: string;
  valid_until: string | null;
  esta_passport_last3: string | null;
};

type UkRow = {
  traveler_id: string;
  status: string;
  valid_until: string | null;
  passport_last3: string | null;
};

/** Lecture seule des contrôles déjà faits. Ne lance aucune vérification. */
export async function settledFormalityCountries(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    returnOn: string | null;
    travelers: CrmBookingTraveler[];
    documents: CrmTravelDocument[];
    holder?: PersonName | null;
  }
) {
  if (!input.travelers.length) return [];
  const [{ data: esta }, { data: uk }] = await Promise.all([
    admin
      .from("crm_esta_checks")
      .select("traveler_id, status, valid_until, esta_passport_last3")
      .eq("booking_id", input.bookingId),
    admin
      .from("crm_uk_eta_checks")
      .select("traveler_id, status, valid_until, passport_last3")
      .eq("booking_id", input.bookingId),
  ]);
  const estaTones = ((esta || []) as EstaRow[]).flatMap((row) => {
    if (!isEstaStatus(row.status)) return [];
    const traveler = input.travelers.find((person) => person.id === row.traveler_id);
    if (!traveler) return [];
    const passport = passportForEsta(traveler, input.documents, input.holder);
    const alerts = estaAlerts({
      status: row.status,
      validUntil: row.valid_until,
      returnOn: input.returnOn,
      passportExpires: passport?.expires_on,
      passportNumber: passport?.number,
      estaPassportLast3: row.esta_passport_last3,
    });
    return [{ travelerId: row.traveler_id, tone: estaCoversTrip(row.status, alerts) ? "ok" : "warn" }];
  });
  const ukEtaTones = ((uk || []) as UkRow[]).flatMap((row) => {
    if (!isUkEtaStatus(row.status)) return [];
    const traveler = input.travelers.find((person) => person.id === row.traveler_id);
    if (!traveler) return [];
    const passport = passportForEsta(traveler, input.documents, input.holder);
    const alerts = ukEtaAlerts({
      status: row.status,
      validUntil: row.valid_until,
      returnOn: input.returnOn,
      passportExpires: passport?.expires_on,
      passportNumber: passport?.number,
      passportLast3: row.passport_last3,
    });
    return [{ travelerId: row.traveler_id, tone: ukEtaCoversTrip(row.status, alerts) ? "ok" : "warn" }];
  });
  return settledAuthorizationCountries({
    travelerIds: input.travelers.map((traveler) => traveler.id),
    estaTones,
    ukEtaTones,
  });
}
