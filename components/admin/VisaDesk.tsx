import Link from "next/link";
import { reasonLabel, type DeskTask } from "@/lib/crm/visa-desk";

export function VisaDesk({ open, grey }: { open: DeskTask[]; grey: DeskTask[] }) {
  return (
    <section className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">À traiter</h2>
      {open.length === 0 ? <p className="mt-2 text-sm text-muted">Rien à traiter</p> : null}
      <ul className="mt-2 divide-y divide-border text-sm">
        {open.map((task) => (
          <li key={task.bookingId} className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words">
              {task.holderName} ·{" "}
              <Link href={`/admin/reservations/${task.bookingId}`} className="font-semibold underline">
                {task.reference}
              </Link>{" "}
              · {reasonLabel(task.reasons)}
            </span>
            <form action={`/api/admin/visa-tasks/${task.bookingId}/done`} method="post" className="shrink-0">
              <button className="admin-tap rounded-full border border-[var(--admin-navy)] px-3 py-1 text-xs font-semibold">
                Fait
              </button>
            </form>
          </li>
        ))}
        {grey.map((task) => (
          <li key={task.bookingId} className="break-words py-2 text-muted">
            {task.holderName} · {task.reference} · {reasonLabel(task.reasons)} · Fait
          </li>
        ))}
      </ul>
    </section>
  );
}
