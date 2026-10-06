import Link from "next/link";
import type { UkEtaNoticeLine } from "@/lib/crm/uk-eta-run";

export function UkEtaNoticeList({ notices }: { notices: UkEtaNoticeLine[] }) {
  if (!notices.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-[var(--border)] bg-white/70 p-4">
      <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">ETA Royaume-Uni</h3>
      <ul className="mt-2 divide-y divide-border text-sm">
        {notices.map((notice) => (
          <li key={notice.id} className="py-3">
            <Link href={notice.href} className="font-semibold text-[var(--admin-navy)] underline">
              {notice.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
