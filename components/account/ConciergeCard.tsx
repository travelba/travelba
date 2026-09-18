import { siteConfig } from "@/lib/site";
import { Icon } from "@/components/crm/icons";

export function ConciergeCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-4 rounded-2xl bg-[#efebe0] p-4 shadow-sm">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--admin-red)] text-white">
          <Icon name="support_agent" className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold text-[var(--admin-navy-deep)]">
            Besoin d&apos;un ajustement ?
          </h4>
          <p className="truncate text-xs text-muted">Votre conciergerie Travelba est joignable 7j/7.</p>
        </div>
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="shrink-0 rounded-full bg-white px-3 py-2 font-label text-[11px] font-semibold text-[var(--admin-navy)] shadow-sm"
        >
          Contacter
        </a>
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-[#efebe0] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--admin-navy)] text-sm font-bold text-[#f8f6f0]">
            TBA
          </div>
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[var(--admin-gold)] ring-2 ring-[var(--background)]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="text-base font-semibold text-[var(--admin-navy-deep)]">Conciergerie Travelba</h4>
            <span className="rounded-full bg-[#ffe088] px-1.5 py-0.5 font-label text-[9px] font-bold uppercase tracking-wider text-[#241a00]">
              24/7
            </span>
          </div>
          <p className="text-xs text-muted">Votre travel planner dédiée</p>
          <p className="mt-0.5 flex items-center gap-1 font-label text-[10px] font-bold uppercase tracking-wider text-[#735c00]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--admin-gold)]" />
            En ligne · {siteConfig.phoneDisplay}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--admin-navy-deep)] font-label text-[11px] font-semibold tracking-wide text-white"
        >
          <Icon name="chat" className="h-[18px] w-[18px]" />
          Échanger avec Travelba
        </a>
        <a
          href={`tel:${siteConfig.phoneDisplay.replace(/\s/g, "")}`}
          aria-label="Appeler la conciergerie"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e2dcd0] text-[var(--admin-navy)]"
        >
          <Icon name="call" className="h-5 w-5" />
        </a>
      </div>
    </section>
  );
}
