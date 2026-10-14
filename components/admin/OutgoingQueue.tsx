"use client";

import { OutgoingRow } from "@/components/admin/OutgoingAttach";
import type { OutgoingLine } from "@/lib/crm/trip-costs";

/** File des sorties à rattacher : d’abord celles qui ont une proposition, puis les autres. */
export function OutgoingQueue({ lines }: { lines: OutgoingLine[] }) {
  if (!lines.length) {
    return <p className="mt-4 text-sm text-muted">Toutes les sorties sont rattachées à un voyage ou hors voyage.</p>;
  }
  const proposed = lines.filter((line) => line.suggestions.length > 0);
  const others = lines.filter((line) => line.suggestions.length === 0);
  return (
    <div className="mt-3 space-y-6">
      {proposed.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Avec une proposition</h3>
          <ul className="mt-1 divide-y divide-[var(--border)]">
            {proposed.map((line) => (
              <OutgoingRow key={`${line.source}:${line.id}`} line={line} />
            ))}
          </ul>
        </div>
      ) : null}
      {others.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Sans proposition</h3>
          <ul className="mt-1 divide-y divide-[var(--border)]">
            {others.map((line) => (
              <OutgoingRow key={`${line.source}:${line.id}`} line={line} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
