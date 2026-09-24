import Link from "next/link";
import { reasonLabel, type DeskTask } from "@/lib/crm/visa-desk";

export function VisaDesk({ open, grey }: { open: DeskTask[]; grey: DeskTask[] }) {
  return (
    <section className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">À traiter</h2>
      {open.length === 0 ? <p className="mt-2 text-sm text-muted">Rien à traiter</p> : null}
      <ul className="mt-2 divide-y divide-border text-sm">
        {open.map((task) => (
          <li key={task.bookingId} className="flex items-center justify-between gap-3 py-2">
            <span>
              {task.holderName} ·{" "}
              <Link href={`/admin/reservations/${task.bookingId}`} className="font-semibold underline">
                {task.reference}
              </Link>{" "}
              · {reasonLabel(task.reasons)}
            </span>
            <form action={`/api/admin/visa-tasks/${task.bookingId}/done`} method="post">
              <button className="rounded-full border border-[var(--admin-navy)] px-3 py-1 text-xs font-semibold">
                Fait
              </button>
            </form>
          </li>
        ))}
        {grey.map((task) => (
          <li key={task.bookingId} className="py-2 text-muted">
            {task.holderName} · {task.reference} · {reasonLabel(task.reasons)} · Fait
          </li>
        ))}
      </ul>
    </section>
  );
}
