import Link from "next/link";
import type { ServiceDeskLine } from "@/lib/crm/service-desk";

export function ServiceDesk({ lines }: { lines: ServiceDeskLine[] }) {
  if (!lines.length) return null;
  return (
    <section id="services" className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Services à confirmer</h2>
      <ul className="mt-2 divide-y divide-border text-sm">
        {lines.map((line) => (
          <li key={line.itemId} className="py-3">
            <span className="min-w-0 break-words">
              {line.holderName} ·{" "}
              <Link href={`/admin/reservations/${line.bookingId}`} className="font-semibold underline">
                {line.reference}
              </Link>{" "}
              · {line.kindLabel}
              {line.detail ? ` · ${line.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
