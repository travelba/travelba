import Link from "next/link";
import { argentHref } from "@/lib/crm/argent-tabs";
import { Icon } from "@/components/crm/icons";

/** Fiche client : les paiements reçus où ce client est proposé. Le crédit se fait dans Argent, jamais ici. */
export function ClientPaymentsToCredit({ customerId, count }: { customerId: string; count: number }) {
  if (count <= 0) return null;
  return (
    <Link
      href={argentHref("a-encaisser", { client: customerId })}
      className="admin-af-card flex items-center justify-between gap-3 rounded-3xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-5 py-4 text-sm text-[var(--admin-navy)] transition hover:ring-1 hover:ring-[var(--admin-gold)]"
    >
      <span>
        <span className="font-semibold">
          {count} paiement{count > 1 ? "s" : ""} reçu{count > 1 ? "s" : ""} à encaisser
        </span>
        <span className="block text-xs text-muted">Ce client est proposé pour ces virements ou paiements. Créditer se fait dans Argent.</span>
      </span>
      <Icon name="chevron_right" className="h-5 w-5 shrink-0 text-[#9e7e51]" />
    </Link>
  );
}
