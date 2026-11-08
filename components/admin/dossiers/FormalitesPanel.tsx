import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { EstaNoticeList } from "@/components/admin/EstaNoticeList";
import { UkEtaNoticeList } from "@/components/admin/UkEtaNoticeList";
import { VisaDesk } from "@/components/admin/VisaDesk";
import { tripStillOpen, visaRequestNeedsAction } from "@/lib/crm/admin-todo";
import { bookingTabHref } from "@/lib/crm/booking-tabs";
import { addIsoDays } from "@/lib/crm/dates";
import { loadOpenEstaNotices } from "@/lib/crm/esta-run";
import { stayToday } from "@/lib/crm/stay-moment";
import { loadOpenUkEtaNotices } from "@/lib/crm/uk-eta-run";
import { deskView, type DeskTask } from "@/lib/crm/visa-desk";
import { CLIENT_VISA_STEPS, clientVisaStepLabel, formalityName, type ClientVisaStep } from "@/lib/crm/visa-flow";
import type { VisaCorridor } from "@/lib/crm/visa-fees";

const CORRIDORS = new Set<VisaCorridor>(["IL", "US", "GB"]);

function journeyLabel(country: string, step: string | null) {
  const name = CORRIDORS.has(country as VisaCorridor) ? formalityName(country as VisaCorridor) : "Visa";
  const known = step && (CLIENT_VISA_STEPS as readonly string[]).includes(step) ? clientVisaStepLabel(step as ClientVisaStep) : "";
  return [name, known].filter(Boolean).join(" · ");
}

/** Vue Formalités de Dossiers : refus et messages non aboutis, ESTA et ETA encore ouverts. */
export async function FormalitesPanel({ supabase }: { supabase: SupabaseClient }) {
  const today = stayToday();
  const weekAgo = addIsoDays(today, -7);

  const [{ data: taskRows }, estaNotices, ukEtaNotices, { data: requestRows }] = await Promise.all([
    supabase
      .from("crm_visa_tasks")
      .select("booking_id, holder_name, reference, reasons, done_at, created_at")
      .or(`done_at.is.null,done_at.gte.${weekAgo}`)
      .order("created_at", { ascending: false })
      .limit(100),
    loadOpenEstaNotices(supabase).catch(() => []),
    loadOpenUkEtaNotices(supabase).catch(() => []),
    supabase
      .from("crm_visa_requests")
      .select("booking_id, country, status, step, accepted_at")
      .neq("status", "piece")
      .limit(200),
  ]);
  const requestList = (requestRows || []) as {
    booking_id: string;
    country: string;
    status: string | null;
    step: string | null;
    accepted_at: string | null;
  }[];
  const requestBookingIds = [...new Set(requestList.map((row) => row.booking_id).filter(Boolean))];
  const { data: stayRows } = requestBookingIds.length
    ? await supabase.from("crm_bookings").select("id, reference, status, archived_at, end_date").in("id", requestBookingIds)
    : { data: [] as { id: string; reference: string | null; status: string | null; archived_at: string | null; end_date: string | null }[] };
  const stays = new Map(
    ((stayRows || []) as { id: string; reference: string | null; status: string | null; archived_at: string | null; end_date: string | null }[]).map(
      (row) => [row.id, row]
    )
  );
  const journeys = requestList.flatMap((row) => {
    const stay = stays.get(row.booking_id);
    if (!stay || !tripStillOpen(stay, today) || !visaRequestNeedsAction({ status: row.status, acceptedAt: row.accepted_at })) {
      return [];
    }
    return [
      {
        id: `${row.booking_id}:${row.country}`,
        href: bookingTabHref(row.booking_id, "todo"),
        reference: stay.reference || "Dossier",
        label: journeyLabel(row.country, row.step),
      },
    ];
  });
  const desk = deskView(
    ((taskRows || []) as {
      booking_id: string;
      holder_name: string;
      reference: string;
      reasons: DeskTask["reasons"];
      done_at: string | null;
      created_at: string;
    }[]).map((row) => ({
      bookingId: row.booking_id,
      holderName: row.holder_name,
      reference: row.reference,
      reasons: row.reasons || [],
      doneAt: row.done_at,
      createdAt: row.created_at,
    })),
    today
  );

  return (
    <div className="space-y-6">
      <VisaDesk
        open={desk.open}
        grey={desk.grey}
        showEmpty={estaNotices.length === 0 && ukEtaNotices.length === 0 && journeys.length === 0}
      />
      {journeys.length ? (
        <section className="rounded-2xl border border-[var(--border)] bg-white/70 p-4">
          <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">Parcours en cours</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {journeys.map((row) => (
              <li key={row.id} className="py-3">
                <Link href={row.href} className="font-semibold underline">
                  {row.reference}
                </Link>
                <span className="text-[var(--admin-navy)]"> · {row.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <EstaNoticeList notices={estaNotices} />
      <UkEtaNoticeList notices={ukEtaNotices} />
    </div>
  );
}
