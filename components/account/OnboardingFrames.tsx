"use client";

import { useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { BrandMark } from "@/components/crm/BrandMark";
import { Icon } from "@/components/crm/icons";
import { dayHeading } from "@/lib/crm/carnet";
import { encoursCaption, formatDateRangeShort, formatMoney, tripDurationDays } from "@/lib/crm/money";
import {
  CLIENT_ONBOARDING_STEPS,
  ONBOARDING_FIXTURE,
  ONBOARDING_FRAME,
  PROFILE_ONBOARDING_HINTS,
  type OnboardingStepId,
} from "@/lib/crm/onboarding";
import { CLIENT_PROFILE_NAV } from "@/lib/crm/profile-nav";

const TABS = [
  { label: "Accueil", icon: "explore" },
  { label: "Réservations", icon: "luggage" },
  { label: "Transactions", icon: "receipt_long" },
  { label: "Mon compte", icon: "badge" },
] as const;

type ProfileLabel = (typeof CLIENT_PROFILE_NAV)[number]["label"];

export function OnboardingFrame({ stepId }: { stepId: OnboardingStepId }) {
  const step = CLIENT_ONBOARDING_STEPS.find((item) => item.id === stepId) ?? CLIENT_ONBOARDING_STEPS[0];
  const live = step.id === "profil";

  return (
    <div className="mx-auto w-full max-w-[380px] max-lg:[zoom:0.72]" data-onboarding-frame>
      <div className="overflow-hidden rounded-[1.7rem] border border-[#e5e3dc] bg-[#faf9f6] shadow-[0_28px_64px_rgba(11,25,44,0.14)] lg:rounded-[2rem] lg:border-[12px] lg:border-[#0b192c] lg:shadow-[0_36px_80px_rgba(11,25,44,0.28)]">
        <div className="flex h-12 items-center justify-between gap-2 border-b border-[#e5e3dc] bg-[#faf9f6] px-3">
          <span className="flex min-w-0 items-center gap-2">
            <AgencyLogo className="h-7 w-7" alt="" />
            <span className="min-w-0">
              <span className="block text-[8px] font-bold uppercase tracking-[0.16em] text-[#c5a880]">
                {ONBOARDING_FRAME.brand}
              </span>
              <span className="block truncate font-display text-[13px] font-semibold leading-none text-[#0b192c]">
                {step.tab}
              </span>
            </span>
          </span>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0b192c] text-[10px] font-bold text-[#c5a880]">
            {ONBOARDING_FIXTURE.initials}
          </span>
        </div>
        <div className="px-3 py-3" aria-hidden={live ? undefined : true}>
          {step.id === "accueil" ? <HomeCapture /> : null}
          {step.id === "carnet" ? <CarnetCapture /> : null}
          {step.id === "transactions" ? <LedgerCapture /> : null}
          {step.id === "profil" ? <ProfileCapture /> : null}
        </div>
        <div className="grid h-14 grid-cols-4 border-t border-[#e5e3dc] bg-[#faf9f6]" aria-hidden="true">
          {TABS.map((tab) => {
            const active = tab.label === step.tab;
            return (
              <div
                key={tab.label}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] leading-none ${
                  active ? "font-bold text-[#0b192c]" : "font-semibold text-[#5a5c60]"
                }`}
              >
                <span
                  className={`flex h-6 w-9 items-center justify-center rounded-full ${
                    active ? "bg-[#0b192c] text-[#c5a880]" : "text-[#0b192c]"
                  }`}
                >
                  <Icon name={tab.icon} className="h-4 w-4" filled={active} />
                </span>
                {tab.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HomeCapture() {
  const nights = tripDurationDays(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end);
  const dates = formatDateRangeShort(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end);
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">
          {ONBOARDING_FRAME.brand} · {ONBOARDING_FRAME.member}
        </p>
        <p className="font-display text-xl font-bold tracking-tight text-[#0b192c]">
          {ONBOARDING_FRAME.hello} {ONBOARDING_FIXTURE.givenName}
        </p>
      </div>
      <div className="rounded-2xl border border-[#c5a880] bg-[#f8f3eb] px-3 py-2.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{ONBOARDING_FRAME.encours}</p>
        <p className="font-display text-[1.35rem] font-bold tracking-tight text-[#0b192c]">
          {formatMoney(ONBOARDING_FIXTURE.balance)}
        </p>
        <p className="text-[11px] text-muted">{encoursCaption(ONBOARDING_FIXTURE.balance)}</p>
      </div>
      <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-sm">
        <div className="relative h-[11.5rem] bg-[#0b192c]">
          <div className="absolute inset-0 bg-[linear-gradient(165deg,#07111c_0%,#0b192c_46%,#1a3354_100%)]" />
          <div className="absolute -right-6 top-4 h-24 w-32 rounded-full bg-[#c5a880]/30 blur-2xl" />
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#c5a880]/30 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#0b192c]">
              <Icon name="timer" className="h-3.5 w-3.5 text-[#c5a880]" />
              <span className="font-bold">{ONBOARDING_FIXTURE.countdown}</span>
              <span className="font-normal text-[#5a5c60]">{ONBOARDING_FRAME.beforeFlight}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#0b192c]">
              <Icon name="cloud" className="h-3.5 w-3.5 text-[#c5a880]" />
              <span className="font-bold">{ONBOARDING_FIXTURE.weather}</span>
              <span className="font-normal text-[#5a5c60]">{ONBOARDING_FIXTURE.weatherLabel}</span>
            </span>
          </div>
          <div className="absolute inset-x-3 bottom-3 text-white">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c5a880]">
              <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
              {dates}
              {nights ? ` · ${nights} jours` : ""}
            </p>
            <p className="font-display text-[1.65rem] font-bold leading-tight">{ONBOARDING_FIXTURE.stayCities[0]}</p>
            <span className="mt-2 flex h-10 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#0b192c] shadow-md">
              {ONBOARDING_FRAME.openStay}
              <Icon name="arrow_forward" className="h-4 w-4 text-[#c5a880]" />
            </span>
          </div>
        </div>
      </article>
      <section className="overflow-hidden rounded-2xl bg-[#0b192c] px-3.5 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#c5a880]">{ONBOARDING_FRAME.nextFlight}</p>
            <p className="mt-0.5 font-display text-base font-bold">{ONBOARDING_FIXTURE.flight}</p>
            <p className="font-display text-sm font-semibold text-[#c5a880]">{ONBOARDING_FIXTURE.flightNumber}</p>
            <p className="mt-1 text-[12px] text-white/80">{ONBOARDING_FRAME.towardStay}</p>
          </div>
          <p className="text-right">
            <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">{ONBOARDING_FRAME.hour}</span>
            <span className="font-display text-xl font-bold">{ONBOARDING_FIXTURE.flightTime}</span>
          </p>
        </div>
        <div className="mt-3 border-t border-dashed border-white/20 pt-3">
          <span className="flex h-10 items-center justify-center rounded-full bg-[#c5a880] text-sm font-semibold text-[#0b192c]">
            {ONBOARDING_FRAME.calendar}
          </span>
        </div>
      </section>
    </div>
  );
}

function CarnetCapture() {
  const nights = tripDurationDays(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end);
  const dates = formatDateRangeShort(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end);
  const day = dayHeading(ONBOARDING_FIXTURE.start);
  return (
    <div className="space-y-3">
      <article className="overflow-hidden rounded-xl border border-[#c5c6cd]/35 bg-white shadow-sm">
        <div className="relative h-[6.5rem] bg-[#0b192c]">
          <div className="absolute inset-0 bg-[linear-gradient(165deg,#07111c_0%,#0b192c_50%,#1a3354_100%)]" />
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#faf9f6]/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#0b192c]">
              <Icon name="timer" className="h-3.5 w-3.5 text-[#b89768]" />
              {ONBOARDING_FIXTURE.countdown}
            </span>
          </div>
          <div className="absolute inset-x-3 bottom-2.5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c5a880]">
              {dates}
              {nights ? ` (${nights} jours)` : ""}
            </p>
            <p className="font-display text-xl font-bold leading-tight">{ONBOARDING_FIXTURE.stayCities[0]}</p>
          </div>
        </div>
        <div className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#c5c6cd]/25 bg-[#f4f3f0] p-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[#44474c]">{ONBOARDING_FRAME.reference}</p>
              <p className="text-sm font-bold text-[#0b192c]">{ONBOARDING_FIXTURE.reference}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[#44474c]">{ONBOARDING_FRAME.amount}</p>
              <p className="text-[13px] font-bold leading-snug text-[#0b192c]">{ONBOARDING_FRAME.priceHidden}</p>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-[#0b192c]">{ONBOARDING_FRAME.paidBy}</p>
        </div>
      </article>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-bold text-[#0b192c]">{ONBOARDING_FRAME.itinerary}</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c5a880]">{day}</p>
        <StepLine kind="hotel" kicker={ONBOARDING_FRAME.hotel} title={ONBOARDING_FIXTURE.hotel} meta={ONBOARDING_FIXTURE.stayCities[0]} />
        <p className="pl-[3.25rem] text-[11px] text-muted">{ONBOARDING_FRAME.piece}</p>
        <StepLine kind="transfer" kicker={ONBOARDING_FRAME.transfer} title={ONBOARDING_FRAME.transferTitle} meta={ONBOARDING_FRAME.transferMeta} />
        <StepLine
          kind="flight"
          kicker={`${ONBOARDING_FRAME.flightKind} · ${ONBOARDING_FIXTURE.flightTime}`}
          title={ONBOARDING_FRAME.towardStay}
          meta={`${ONBOARDING_FIXTURE.flight} · ${ONBOARDING_FIXTURE.flightNumber}`}
        />
      </section>
    </div>
  );
}

function StepLine({
  kind,
  kicker,
  title,
  meta,
}: {
  kind: string;
  kicker: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-3 py-2.5">
      <BrandMark item={{ kind, title }} className="h-9 w-9" />
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">{kicker}</span>
        <span className="block text-sm font-semibold leading-snug text-[#0b192c]">{title}</span>
        <span className="block truncate text-xs text-muted">{meta}</span>
      </span>
    </div>
  );
}

function LedgerCapture() {
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[#e9e8e5]/60 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#c5a880]/15 text-[#9c7c4e]">
            <Icon name="verified_user" className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">{ONBOARDING_FRAME.ledger}</span>
        </div>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">{ONBOARDING_FRAME.encours}</p>
        <p className="font-display text-[1.7rem] font-bold tracking-tight text-[#0b192c]">
          {formatMoney(ONBOARDING_FIXTURE.balance)}
        </p>
        <p className="text-[12px] text-muted">{encoursCaption(ONBOARDING_FIXTURE.balance)}</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
          <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#0b192c] to-[#c5a880]" />
        </div>
      </section>
      <div className="flex items-center gap-1.5">
        <Icon name="account_balance" className="h-5 w-5 text-[#0b192c]" />
        <h2 className="font-display text-lg font-semibold text-[#0b192c]">{ONBOARDING_FRAME.movements}</h2>
      </div>
      <ul className="space-y-2">
        <LedgerLine
          title={ONBOARDING_FRAME.stayLine}
          meta={ONBOARDING_FRAME.stayWhen}
          amount={formatMoney(ONBOARDING_FIXTURE.stayAmount)}
          credit={false}
        />
        <LedgerLine
          title={ONBOARDING_FRAME.paymentLine}
          meta={ONBOARDING_FRAME.receivedWhen}
          amount={formatMoney(ONBOARDING_FIXTURE.receivedAmount)}
          credit
        />
      </ul>
    </div>
  );
}

function LedgerLine({
  title,
  meta,
  amount,
  credit,
}: {
  title: string;
  meta: string;
  amount: string;
  credit: boolean;
}) {
  return (
    <li className="rounded-xl border border-[#e9e8e5]/60 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 p-3">
        <span className="flex min-w-0 items-start gap-2.5">
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              credit ? "bg-[#c5a880]/15 text-[#0b192c]" : "bg-[#efeeeb] text-[#0b192c]"
            }`}
          >
            <Icon name={credit ? "south_west" : "receipt_long"} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold leading-snug text-[#0b192c]">{title}</span>
            <span className="block text-[12px] text-muted">{meta}</span>
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[13px] font-bold text-[#0b192c]">{amount}</span>
          <span
            className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              credit
                ? "border-[#c5a880]/30 bg-[#c5a880]/15 text-[#0b192c]"
                : "border-[#e5e3dc] bg-[#efeeeb] text-[#44474c]"
            }`}
          >
            {credit ? ONBOARDING_FRAME.received : ONBOARDING_FRAME.posted}
          </span>
        </span>
      </div>
    </li>
  );
}

function ProfileCapture() {
  const [label, setLabel] = useState<ProfileLabel>("Vous");
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-3.5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Mon compte</p>
        <p className="mt-1 font-display text-xl font-bold tracking-tight text-[#0b192c]">{ONBOARDING_FIXTURE.fullName}</p>
        <p className="truncate text-[13px] text-muted">{ONBOARDING_FIXTURE.email}</p>
      </section>
      <div className="flex rounded-full bg-[#efeeeb] p-1" role="tablist" aria-label="Sections du compte">
        {CLIENT_PROFILE_NAV.map((section) => {
          const active = section.label === label;
          return (
            <button
              key={section.href}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLabel(section.label)}
              className={`flex-1 rounded-full px-1 py-2 text-center text-[10px] font-semibold leading-none ${
                active ? "bg-[#0b192c] text-white" : "text-[#5a5c60]"
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </div>
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-3.5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-[#44474c]">{PROFILE_ONBOARDING_HINTS[label]}</p>
        <ProfileBody label={label} />
      </section>
    </div>
  );
}

function ProfileBody({ label }: { label: ProfileLabel }) {
  if (label === "Pièces") {
    return (
      <div className="mt-3 rounded-xl bg-[#faf9f6] px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#9e7e51]">{ONBOARDING_FRAME.passport}</p>
        <p className="text-sm font-semibold text-[#0b192c]">{ONBOARDING_FIXTURE.fullName}</p>
        <p className="text-[12px] text-muted">{ONBOARDING_FRAME.passportUntil}</p>
      </div>
    );
  }
  if (label === "Voyageurs") {
    return (
      <div className="mt-3 rounded-xl bg-[#faf9f6] px-3 py-2.5">
        <p className="text-sm font-semibold text-[#0b192c]">{ONBOARDING_FIXTURE.companion}</p>
        <p className="text-[12px] text-muted">{ONBOARDING_FIXTURE.companionRole}</p>
      </div>
    );
  }
  if (label === "Facturation") {
    return (
      <div className="mt-3 rounded-xl bg-[#faf9f6] px-3 py-2.5">
        <p className="text-sm font-semibold text-[#0b192c]">{ONBOARDING_FIXTURE.company}</p>
        <p className="text-[12px] text-muted">{ONBOARDING_FRAME.companyKind}</p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-[#faf9f6] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#9e7e51]">{ONBOARDING_FRAME.phoneLabel}</p>
      <p className="text-sm font-semibold text-[#0b192c]">{ONBOARDING_FIXTURE.phone}</p>
    </div>
  );
}
