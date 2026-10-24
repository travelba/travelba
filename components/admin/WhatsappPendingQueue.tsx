import Link from "next/link";
import { ConciergeFollowupSend } from "@/components/admin/ConciergeFollowupSend";
import { maskSensitiveCopy } from "@/lib/crm/whatsapp-inbox";

export type PendingDraft = {
  id: string;
  title: string;
  who: string;
  body: string;
  href: string;
  sendable: boolean;
  reason: string;
  /** Relance Concierge. Absent : lien vers le dossier (ESTA, ETA, proposition). */
  followupId?: string;
};

/** File unique : brouillons du Concierge, ESTA et ETA. Rien ne part sans le bouton. */
export function WhatsappPendingQueue({
  drafts,
  previewBlocked,
  offline = false,
}: {
  drafts: PendingDraft[];
  previewBlocked: boolean;
  offline?: boolean;
}) {
  return (
    <section id="valider" aria-labelledby="valider-titre" className="rounded-3xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="valider-titre" className="font-display text-lg font-bold text-[#0B192C]">
          À envoyer
        </h2>
        <p className="text-xs text-[#5c6570]">
          {drafts.length
            ? `${drafts.length} ${drafts.length > 1 ? "messages attendent" : "message attend"} votre clic.`
            : "Rien en attente."}
        </p>
      </div>
      {drafts.length ? (
        <ul className="mt-3 space-y-2">
          {drafts.map((row) => (
            <li key={row.id} className="rounded-2xl bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-[#0B192C]">{row.title}</p>
                <Link href={row.href} className="text-xs font-semibold text-[#0B192C] underline">
                  {row.who}
                </Link>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[var(--color-ink-soft)]">{maskSensitiveCopy(row.body)}</p>
              <p className="mt-1 text-xs text-[#5c6570]">{row.reason}</p>
              {row.followupId ? (
                <ConciergeFollowupSend
                  id={row.followupId}
                  previewBlocked={previewBlocked}
                  sendable={row.sendable && !previewBlocked}
                  blockedReason={previewBlocked ? "Aperçu : rien n’est parti." : row.sendable ? undefined : row.reason}
                  offline={offline}
                />
              ) : (
                <Link href={row.href} className="mt-2 inline-flex text-xs font-semibold text-[#0B192C] underline">
                  Ouvrir pour envoyer
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[#5c6570]">Les veilles, arrivées, retours, ESTA et ETA apparaîtront ici.</p>
      )}
    </section>
  );
}
