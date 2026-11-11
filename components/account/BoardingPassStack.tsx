import { Icon } from "@/components/crm/icons";
import { clientBoardingHref, type ClientBoardingCard } from "@/lib/crm/client-boarding-pass";
import { BOARDING_PASSES_READY_LABEL } from "@/lib/crm/flight-watch";

export function BoardingReadyNote() {
  return (
    <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--admin-navy)]">
      <Icon name="airplane_ticket" className="h-4 w-4 shrink-0 text-[var(--admin-gold)]" />
      {BOARDING_PASSES_READY_LABEL}
    </p>
  );
}

function placeLabel(terminal: string, gate: string) {
  const terminalText = terminal ? (/^terminal\b/i.test(terminal) ? terminal : `Terminal ${terminal}`) : "";
  const gateText = gate ? (/^(porte|gate)\b/i.test(gate) ? gate : `Porte ${gate}`) : "";
  return [terminalText, gateText].filter(Boolean).join(" · ");
}

function openHref(card: ClientBoardingCard) {
  if (card.href) return card.href;
  return clientBoardingHref(card.documentId, card.page);
}

export function BoardingPassStack({
  cards,
  variant,
}: {
  cards: ClientBoardingCard[];
  variant: "home" | "flight";
}) {
  if (!cards.length) return null;
  const hole = variant === "home" ? "bg-[#0B192C]" : "bg-white";
  const slip = variant === "home" ? "border border-white/10 bg-[#16304a]" : "bg-[#0B192C]";
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto" role="list" aria-label="Cartes d’embarquement">
      {cards.map((card) => {
        const href = openHref(card);
        const external = Boolean(href && href.startsWith("/api/"));
        const where = placeLabel(card.terminal, card.gate);
        return (
          <article
            key={card.key}
            role="listitem"
            className={`relative overflow-hidden rounded-2xl text-white ${slip} ${
              cards.length > 1 ? "w-[86%] shrink-0 snap-start" : "w-full"
            }`}
          >
            <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">
                  Carte d’embarquement
                </p>
                <p className="mt-1 truncate font-display text-xl font-bold">
                  {card.firstName || "Carte d’embarquement"}
                </p>
                {card.flight ? <p className="mt-1 text-sm font-semibold text-[#C5A880]">{card.flight}</p> : null}
                {card.route ? <p className="mt-1 text-sm text-white/80">{card.route}</p> : null}
                {card.when ? <p className="mt-1 text-xs text-white/70">{card.when}</p> : null}
              </div>
              <div className="shrink-0 text-right">
                {card.seat ? (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Siège</p>
                    <p className="font-display text-2xl font-bold leading-none">{card.seat}</p>
                  </>
                ) : null}
                {where ? <p className="mt-2 max-w-[7.5rem] text-[11px] font-semibold leading-snug text-white/80">{where}</p> : null}
              </div>
            </div>
            <div className="relative border-t border-dashed border-white/25 px-4 py-3">
              <span className={`absolute -left-2 -top-2 h-4 w-4 rounded-full ${hole}`} aria-hidden />
              <span className={`absolute -right-2 -top-2 h-4 w-4 rounded-full ${hole}`} aria-hidden />
              {href ? (
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C]"
                >
                  Ouvrir la carte
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
