import Link from "next/link";
import type { ServiceDeskLine } from "@/lib/crm/service-desk";

export function ServiceDesk({ lines }: { lines: ServiceDeskLine[] }) {
  if (!lines.length) return null;
  return (
    <section id="services" className="rounded-2xl border border-[var(--border)] bg-white/70 p-4">
      <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">Services à confirmer</h3>
      <ul className="mt-2 divide-y divide-border text-sm">
        {lines.map((line) => (
          <li key={line.itemId} className="py-3">
            <p className="font-semibold text-[var(--admin-navy)]">
              {line.holderName} ·{" "}
              <Link href={`/admin/reservations/${line.bookingId}`} className="underline">
                {line.reference}
              </Link>{" "}
              · {line.kindLabel}
            </p>
            {line.detail ? <p className="mt-1 break-words text-muted">{line.detail}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
