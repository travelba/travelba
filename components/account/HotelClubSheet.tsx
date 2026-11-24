"use client";

import { useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { greetingGivenName } from "@/lib/crm/identity";
import {
  HOTEL_ACCESS_EYEBROW,
  HOTEL_ACCESS_LEVEL,
  HOTEL_ACCESS_LINES,
  HOTEL_ACCESS_OFFER,
  HOTEL_ACCESS_PROMISE,
  HOTEL_ACCESS_RESERVE,
  HOTEL_ACCESS_UNTIL,
  HOTEL_CLUB_BACK,
  HOTEL_CLUB_CARD,
  HOTEL_CLUB_FAMILY,
  HOTEL_CLUB_GIVEN,
  HOTEL_CLUB_LADDER,
  HOTEL_CLUB_LADDER_LABEL,
  HOTEL_CLUB_LEVEL,
  HOTEL_CLUB_NEXT,
  HOTEL_CLUB_NUMBER,
  HOTEL_CLUB_OPEN,
  HOTEL_CLUB_TIERS,
  HOTEL_CLUB_TITLE,
  HOTEL_CLUB_YOURS,
  hotelClubLadderState,
  hotelMemberNumber,
} from "@/lib/crm/hotel-search-home";

/** La carte du club, la même que l’icône Hôtel. `showPrices` faux masque les montants. */
export function HotelClubSheet({
  firstName,
  lastName,
  customerId,
  heroSrc,
  onHeroError,
  untilLabel = HOTEL_ACCESS_UNTIL,
  cardUntil,
  eyebrow = HOTEL_ACCESS_EYEBROW,
  showPrices = true,
  embedded = false,
  pricesOpen: pricesOpenProp,
  onPrices,
  onClose,
}: {
  firstName: string;
  lastName: string;
  customerId: string;
  heroSrc: string;
  onHeroError?: () => void;
  /** Date ou durée affichée. Par défaut, la date du catalogue hôtel. */
  untilLabel?: string;
  /** Durée sur la carte, si elle doit rester plus courte que untilLabel. */
  cardUntil?: string;
  /** Nom sur la carte. Par défaut, « Club Travel BA ». */
  eyebrow?: string;
  showPrices?: boolean;
  embedded?: boolean;
  pricesOpen?: boolean;
  onPrices?: (open: boolean) => void;
  onClose?: () => void;
}) {
  const [localPrices, setLocalPrices] = useState(false);
  const pricesOpen = showPrices && (pricesOpenProp ?? localPrices);
  function setPrices(open: boolean) {
    if (!showPrices) return;
    if (onPrices) onPrices(open);
    else setLocalPrices(open);
  }
  const frame = embedded ? "h-club h-club-inline" : "h-club";

  if (pricesOpen) {
    return (
      <div className={frame} data-hotel-prices="1" role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : true} aria-label={HOTEL_CLUB_LADDER_LABEL}>
        <p className="h-club-title">{HOTEL_CLUB_LADDER_LABEL}</p>
        <div className="h-club-body">
          <div className="h-loyalty-pad">
            <div className="h-club-tiers" data-hotel-tiers="1">
              {HOTEL_CLUB_TIERS.map((tier) => {
                const state = hotelClubLadderState(tier.name);
                return (
                  <section key={tier.name} className="h-club-tier" data-state={state} data-hotel-tier={tier.name}>
                    <header className="h-club-tier-head">
                      <div className="min-w-0">
                        <h2 className="h-club-tier-name">{tier.name}</h2>
                        {state === "now" ? <p className="h-club-tier-mark">{HOTEL_CLUB_YOURS}</p> : null}
                        {state === "next" ? <p className="h-club-tier-mark">{HOTEL_CLUB_NEXT}</p> : null}
                      </div>
                      {showPrices ? <p className="h-club-tier-price">{tier.price}</p> : null}
                    </header>
                    <HotelBenefits lines={[...tier.lines]} title={tier.name} layout="grid" />
                  </section>
                );
              })}
            </div>
            <p className="h-club-reserve">{HOTEL_ACCESS_RESERVE}</p>
          </div>
        </div>
        <div className="h-club-bar">
          <button type="button" className="h-club-open h-press" onClick={() => setPrices(false)}>
            {HOTEL_CLUB_BACK}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={frame} data-hotel-club="1" role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : true} aria-label={HOTEL_CLUB_TITLE}>
      <p className="h-club-title">{HOTEL_CLUB_TITLE}</p>
      <div className="h-club-body" data-hotel-agency-benefits="1">
        <div className="h-club-hero" data-hotel-hero="1">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo de lieu ou image déjà dans le projet */}
          <img
            src={heroSrc}
            alt=""
            width={960}
            height={540}
            fetchPriority="high"
            decoding="async"
            onError={onHeroError}
            className="h-club-hero-photo"
          />
          <div className="h-club-hero-shade" aria-hidden />
          <div className="h-club-hero-row">
            <div className="min-w-0">
              <p className="h-club-given">
                <span className="sr-only">{HOTEL_CLUB_GIVEN}</span>
                {greetingGivenName(firstName) || "—"}
              </p>
              <p className="h-club-hero-number">{hotelMemberNumber(customerId)}</p>
              <p className="h-club-hero-meta">{HOTEL_CLUB_NUMBER}</p>
            </div>
            <AgencyLogo className="h-16 w-16" alt="" />
          </div>
        </div>
        <div className="h-club-level">
          <div className="h-club-level-mark">
            <p className="h-loyalty-label">{HOTEL_CLUB_LEVEL}</p>
            <p className="h-club-level-name">{HOTEL_ACCESS_LEVEL}</p>
          </div>
          <div className="text-right">
            <p className="h-loyalty-label">{HOTEL_ACCESS_OFFER}</p>
            <p className="h-club-until">{untilLabel}</p>
          </div>
        </div>
        <div className="h-loyalty-pad">
          <div className="h-loyalty-wrap">
            <p className="h-member-status">{HOTEL_ACCESS_LEVEL}</p>
            <div className="h-member h-loyalty" data-card={HOTEL_ACCESS_LEVEL}>
              {/* eslint-disable-next-line @next/next/no-img-element -- photo de lieu ou image déjà dans le projet */}
              <img src={heroSrc} alt="" width={960} height={540} decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-40" />
              <div className="absolute inset-0 bg-[#0B192C]/78" aria-hidden />
              <div className="relative flex h-full flex-col justify-between px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="h-card-kicker">{eyebrow}</p>
                  <AgencyLogo className="h-club-card-logo" alt="" />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="h-loyalty-value">
                      <span className="sr-only">{HOTEL_CLUB_FAMILY}</span>
                      {[greetingGivenName(firstName), lastName.trim()].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="h-loyalty-number">{hotelMemberNumber(customerId)}</p>
                  </div>
                  <p className="h-card-until">{cardUntil || untilLabel}</p>
                </div>
              </div>
            </div>
          </div>
          <ol className="h-ladder" aria-label={HOTEL_CLUB_LADDER_LABEL} data-hotel-ladder="1">
            {HOTEL_CLUB_LADDER.map((name) => {
              const state = hotelClubLadderState(name);
              return (
                <li key={name} data-state={state} aria-current={state === "now" ? "step" : undefined}>
                  <button
                    type="button"
                    className="h-ladder-step"
                    data-hotel-status={name}
                    onClick={showPrices ? () => setPrices(true) : undefined}
                  >
                    <span className="h-ladder-dot" aria-hidden />
                    <span className="h-ladder-name">{name}</span>
                    {state === "now" ? <span className="h-ladder-yours">{HOTEL_CLUB_YOURS}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="sr-only">{HOTEL_CLUB_CARD}</p>
          <p className="h-club-promise">{HOTEL_ACCESS_PROMISE}</p>
          <HotelBenefits lines={[...HOTEL_ACCESS_LINES]} title={HOTEL_ACCESS_LEVEL} layout="grid" />
          <p className="h-club-reserve">{HOTEL_ACCESS_RESERVE}</p>
        </div>
      </div>
      {onClose ? (
        <div className="h-club-bar">
          <button type="button" className="h-club-open h-press" onClick={onClose}>
            {HOTEL_CLUB_OPEN}
          </button>
        </div>
      ) : null}
    </div>
  );
}
