import Link from "next/link";
import { formatDateTimeFr } from "@/lib/crm/dates";

export type InboundReplyRow = {
  id: string;
  href: string;
  title: string;
  subject: string;
  kind: string;
  sentAt: string;
};

/** Liste légère : des liens, pas de formulaire. Le brouillon s’ouvre sur le dossier. */
export function InboundReplies({ rows }: { rows: InboundReplyRow[] }) {
  if (!rows.length) {
    return <p className="mt-6 text-sm text-[#3d4654]">Aucune réponse d’hôtel pour l’instant.</p>;
  }
  return (
    <ul className="mt-6 divide-y divide-[#e5e0d4] overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display font-bold text-[#0B192C]">{row.title}</p>
            <p className="mt-0.5 truncate text-sm text-[#0B192C]">{row.subject}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#3d4654]">
              <span className="rounded-full bg-[#0B192C] px-2 py-0.5 font-semibold text-[#C5A880]">{row.kind}</span>
              <span className="tabular-nums">{formatDateTimeFr(row.sentAt)}</span>
            </p>
          </div>
          <Link
            href={row.href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-[#faf9f6]"
          >
            Répondre
          </Link>
        </li>
      ))}
    </ul>
  );
}
