import { EstaNoticeList } from "@/components/admin/EstaNoticeList";
import { UkEtaNoticeList } from "@/components/admin/UkEtaNoticeList";
import { VisaDesk } from "@/components/admin/VisaDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { addIsoDays } from "@/lib/crm/dates";
import { loadOpenEstaNotices } from "@/lib/crm/esta-run";
import { stayToday } from "@/lib/crm/stay-moment";
import { loadOpenUkEtaNotices } from "@/lib/crm/uk-eta-run";
import { deskView, type DeskTask } from "@/lib/crm/visa-desk";

export const metadata = { title: "Formalités" };

export default async function AdminFormalitesPage() {
  const { supabase } = await requireStaffPage();
  const today = stayToday();
  const weekAgo = addIsoDays(today, -7);

  const [{ data: taskRows }, estaNotices, ukEtaNotices] = await Promise.all([
    supabase
      .from("crm_visa_tasks")
      .select("booking_id, holder_name, reference, reasons, done_at, created_at")
      .or(`done_at.is.null,done_at.gte.${weekAgo}`)
      .order("created_at", { ascending: false })
      .limit(100),
    loadOpenEstaNotices(supabase).catch(() => []),
    loadOpenUkEtaNotices(supabase).catch(() => []),
  ]);
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
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Formalités"
          subtitle="Refus et messages qui n’ont pas abouti, ESTA et ETA encore ouverts."
        />
      </div>
      <VisaDesk
        open={desk.open}
        grey={desk.grey}
        showEmpty={estaNotices.length === 0 && ukEtaNotices.length === 0}
      />
      <EstaNoticeList notices={estaNotices} />
      <UkEtaNoticeList notices={ukEtaNotices} />
    </div>
  );
}
