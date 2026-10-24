import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { ConciergeFollowupSend } from "@/components/admin/ConciergeFollowupSend";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { maskSensitiveCopy } from "@/lib/crm/whatsapp-inbox";
import { weeklyReview, type QualityFlag, type QualityMark } from "@/lib/crm/concierge-quality";

export const metadata = { title: "Revue WhatsApp" };

const LABELS: Record<string, string> = {
  escalation: "Urgences",
  injection: "Consignes injectées",
  leak_attempt: "Tentatives hors dossier",
  thin: "Réponses minces",
  complaint: "Plaintes",
};

const FOLLOWUP_LABELS: Record<string, string> = {
  predeparture: "Veille du départ",
  checkin: "Arrivée à l’hôtel",
  feedback: "Retour",
  silence_session: "Silence",
  silence_template: "Reprise",
};

const SENDABLE = new Set(["predeparture", "checkin", "feedback"]);

export default async function ConciergeReviewPage() {
  const { supabase } = await requireStaffPage();
  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 21);
  const since = sinceDate.toISOString();
  const loaded = await supabase
    .from("crm_concierge_quality")
    .select("flag, phone, note, marked_at")
    .gte("marked_at", since)
    .order("marked_at", { ascending: false })
    .limit(200);
  const pendingMigration = Boolean(loaded.error);
  const marks = ((pendingMigration ? [] : loaded.data || []) as { flag: string; phone: string; note: string; marked_at: string }[]).map(
    (row) => ({ flag: row.flag as QualityFlag, phone: row.phone, note: row.note, at: row.marked_at }) satisfies QualityMark
  );
  const report = weeklyReview(marks, new Date());
  const planned = await supabase
    .from("crm_concierge_followups")
    .select("id, phone, kind, channel, template_key, draft_body, due_at")
    .eq("status", "planned")
    .order("due_at", { ascending: true })
    .limit(30);
  const followups = (planned.error ? [] : planned.data || []) as {
    id: string;
    phone: string | null;
    kind: string;
    channel: string;
    template_key: string | null;
    draft_body: string;
    due_at: string;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Revue de la semaine" subtitle={`Du ${report.from} au ${report.to}. Les fils escaladés et les tentatives hors dossier.`} />
      </div>
      <Link href="/admin/whatsapp" className="text-sm font-semibold underline-offset-2 hover:underline">
        Retour à la file
      </Link>
      {pendingMigration ? <p className="text-sm text-muted">La revue s’ouvre après la migration du Concierge.</p> : null}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Relances prévues</h2>
        <p className="text-sm text-muted">
          Rien ne part seul. Dans la fenêtre de 24 h, Envoyer au client envoie le texte. Hors fenêtre, le modèle est défini et n’est pas soumis.
        </p>
        {followups.length ? (
          <ul className="space-y-2">
            {followups.map((row) => (
              <li key={row.id} className="admin-af-card rounded-3xl px-5 py-4 text-sm">
                {FOLLOWUP_LABELS[row.kind] || row.kind}
                {row.channel === "template" ? " · hors fenêtre" : " · fenêtre ouverte"}
                {row.phone ? (
                  <Link href={`/admin/whatsapp?fil=${encodeURIComponent(row.phone)}&vue=valider`} className="mt-1 block text-xs font-semibold underline">
                    Ouvrir le fil
                  </Link>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap text-muted">{maskSensitiveCopy(row.draft_body)}</p>
                {SENDABLE.has(row.kind) ? (
                  <ConciergeFollowupSend
                    id={row.id}
                    previewBlocked={isVercelPreview()}
                    sendable={row.channel !== "template"}
                    blockedReason={row.channel === "template" ? "Hors fenêtre de 24 h. Le modèle n’est pas soumis." : undefined}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune relance en attente.</p>
        )}
      </section>
      {report.lines.length ? (
        <ul className="space-y-2">
          {report.lines.map((line) => (
            <li key={line.flag} className="admin-af-card rounded-3xl px-5 py-4 text-sm">
              {LABELS[line.flag] || line.flag} · {line.count}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Rien à revoir sur cette semaine.</p>
      )}
    </div>
  );
}
