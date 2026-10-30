import Link from "next/link";
import { Icon } from "@/components/crm/icons";
import type { LaunchItem } from "@/lib/crm/launch-status";

/** Mise en service, dans Réglages : chaque geste avec son état, le lien tant qu’il reste à faire. */
export function AdminLaunchStatus({ items }: { items: LaunchItem[] }) {
  const remaining = items.filter((item) => !item.done && !item.optional).length;
  return (
    <section aria-labelledby="mise-en-service-titre">
      <h2 id="mise-en-service-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Mise en service
      </h2>
      <p className="mt-1 text-sm text-muted">
        {remaining ? `${remaining} geste${remaining > 1 ? "s" : ""} encore à l’agence. Aucun séjour fictif.` : "Tout est en place."}
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="admin-af-card flex gap-3 rounded-2xl p-4 text-[var(--admin-navy)]">
            <Icon
              name={item.done ? "task_alt" : "timer"}
              className={`mt-0.5 h-5 w-5 shrink-0 ${item.done ? "text-[#2f7a4f]" : "text-[var(--admin-gold-dark)]"}`}
            />
            <div className="min-w-0">
              <p className="font-display text-base font-bold">
                {item.title}
                {item.optional ? <span className="ml-2 text-xs font-medium text-muted">optionnel</span> : null}
              </p>
              <p className="mt-1 text-sm text-muted">{item.description}</p>
              {item.done ? null : (
                <Link href={item.href} className="mt-2 inline-block text-sm font-semibold underline">
                  {item.cta}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
