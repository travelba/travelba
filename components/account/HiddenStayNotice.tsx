import Link from "next/link";
import { siteConfig } from "@/lib/site";

/** Le dossier existe pour ce client mais n’est plus montré (dépublié ou archivé) : pas un 404. */
export function HiddenStayNotice({
  reference,
  backHref = "/mon-compte/reservations",
}: {
  reference: string;
  backHref?: string;
}) {
  const text = encodeURIComponent(`Bonjour, je ne vois plus mon séjour ${reference}.`);
  return (
    <div className="space-y-4">
      <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--aura-blue)]">
        ← Réservations
      </Link>
      <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">{reference}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          Ce séjour n’est plus affiché.
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          L’agence le met à jour ; écrivez-lui sur WhatsApp si vous attendez une information.
        </p>
        <a
          href={`https://wa.me/${siteConfig.whatsappNumber}?text=${text}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
        >
          Écrire à l’agence sur WhatsApp
        </a>
      </section>
    </div>
  );
}
