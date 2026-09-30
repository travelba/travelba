"use client";

import { motion } from "framer-motion";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { Icon } from "@/components/crm/icons";
import { lookupCoverPhoto } from "@/lib/crm/cover-catalog";
import { CHAUFFEUR_EUR, GREETER_ADULT_EUR, GREETER_CHILD_EUR, VISA_EUR } from "@/lib/crm/extras";
import { formatDateRangeShort, formatMoney } from "@/lib/crm/money";
import { CLIENT_ONBOARDING_STEPS } from "@/lib/crm/onboarding";

type StepId = (typeof CLIENT_ONBOARDING_STEPS)[number]["id"];

const ease = [0.22, 1, 0.36, 1] as const;

function rise(reduce: boolean, delay: number) {
  return {
    initial: reduce ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: 0.55, delay, ease },
  } as const;
}

export function OnboardingScene({ id, play }: { id: StepId; play: boolean }) {
  const reduce = !play;
  if (id === "passeport") return <PassportScene reduce={reduce} />;
  if (id === "carnet") return <ItineraryScene reduce={reduce} />;
  if (id === "services") return <ServicesScene reduce={reduce} />;
  if (id === "depenses") return <LedgerScene reduce={reduce} />;
  return <FormalityScene reduce={reduce} />;
}

const PASSPORTS = [
  {
    photo: "/onboarding/camille.jpg",
    given: "Camille",
    birth: "15.06.1984 · Lyon",
    number: "24XY18302",
    expiry: "01.06.2031",
    mrz: "P<FRAMOREL<<CAMILLE<<<<<<<<<<<<<<<<<<<",
    mrz2: "24XY183021FRA8406158F3106017<<<<<<<<<<<8",
  },
  {
    photo: "/onboarding/ines.jpg",
    given: "Inès",
    birth: "02.04.2012 · Lyon",
    number: "18KL90441",
    expiry: "01.06.2031",
    mrz: "P<FRAMOREL<<INES<<<<<<<<<<<<<<<<<<<<<<",
    mrz2: "18KL904416FRA1204024F3106017<<<<<<<<<<<6",
  },
] as const;

function PassportScene({ reduce }: { reduce: boolean }) {
  return (
    <ul className="space-y-2">
      {PASSPORTS.map((person, index) => (
        <motion.li
          key={person.number}
          className="overflow-hidden rounded-xl border border-[#d9cbb6] bg-[#f7f2e8] shadow-sm"
          {...rise(reduce, 0.08 + index * 0.16)}
        >
          <div className="flex items-center justify-between bg-[#7a1f2b] px-3 py-1 text-white">
            <p className="text-[8px] font-bold tracking-[0.16em]">RÉPUBLIQUE FRANÇAISE</p>
            <p className="text-[8px] font-bold tracking-[0.18em]">PASSEPORT</p>
          </div>
          <div className="flex gap-2.5 px-2.5 py-2">
            <span className="relative h-[4.7rem] w-[3.55rem] shrink-0 overflow-hidden bg-[#e7e2da] ring-1 ring-[#c4b49a]">
              <img
                src={person.photo}
                alt=""
                className="h-full w-full object-cover object-top"
              />
              {index === 0 ? (
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 h-px bg-[var(--admin-gold)] shadow-[0_0_8px_1px_rgba(197,168,128,0.95)]"
                  initial={reduce ? { top: "88%", opacity: 0 } : { top: "8%", opacity: 1 }}
                  animate={{ top: "92%", opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 1.15, ease: [0.4, 0, 0.2, 1] }}
                />
              ) : null}
            </span>
            <div className="min-w-0 flex-1 text-[#2a2118]">
              <div className="grid grid-cols-2 gap-x-2">
                <PassportField label="Nom" value="MOREL" />
                <PassportField label="Prénoms" value={person.given} />
                <PassportField label="Nationalité" value="Française" />
                <PassportField label="Sexe" value="F" />
                <PassportField label="Naissance" value={person.birth} />
                <PassportField label="N°" value={person.number} />
              </div>
              <PassportField label="Expiration" value={person.expiry} />
            </div>
          </div>
          <div className="bg-[#efe4d2] px-2 py-1 font-mono text-[6.5px] leading-tight tracking-[0.04em] text-[#3d2c22]">
            <p className="truncate">{person.mrz}</p>
            <p className="truncate">{person.mrz2}</p>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

function PassportField({ label, value }: { label: string; value: string }) {
  return (
    <p className="min-w-0">
      <span className="block text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8a7356]">{label}</span>
      <span className="block truncate text-[11px] font-semibold leading-tight">{value}</span>
    </p>
  );
}

const STAYS = [
  { key: "new york", title: "New York", start: "2026-11-12", end: "2026-11-14" },
  { key: "londres", title: "Londres", start: "2027-03-04", end: "2027-03-08" },
  { key: "tel aviv", title: "Tel-Aviv", start: "2027-06-18", end: "2027-06-22" },
] as const;

function ItineraryScene({ reduce }: { reduce: boolean }) {
  return (
    <ul className="space-y-2">
      {STAYS.map((stay, index) => {
        const photo = lookupCoverPhoto(stay.key);
        return (
          <motion.li
            key={stay.key}
            className="relative h-[6.6rem] overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-sm"
            {...rise(reduce, 0.06 + index * 0.12)}
          >
            {photo ? (
              <CoverPhoto
                src={`/covers/${photo}.webp`}
                alt={stay.title}
                priority={index === 0}
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07111c] via-[#07111c]/20 to-transparent" />
            <span className="absolute right-2.5 top-2.5 rounded-full bg-[var(--admin-gold)] px-2 py-0.5 text-[10px] font-bold text-[var(--admin-navy)]">
              Publié
            </span>
            <div className="absolute inset-x-3 bottom-2.5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                {formatDateRangeShort(stay.start, stay.end)}
              </p>
              <p className="font-display text-xl font-bold leading-tight">{stay.title}</p>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

function ServicesScene({ reduce }: { reduce: boolean }) {
  const chauffeur = formatMoney(CHAUFFEUR_EUR);
  const vip = formatMoney(GREETER_ADULT_EUR + GREETER_CHILD_EUR);
  const cards = [
    {
      icon: "directions_car" as const,
      kicker: "Confirmé · 07h45",
      title: "Chauffeur",
      line: "Lyon → Paris CDG",
      detail: "Transfert aller",
      price: chauffeur,
    },
    {
      icon: "verified" as const,
      kicker: "Confirmé · 10h15",
      title: "VIP Airport",
      line: "Accueil VIP et Fastpass aller",
      detail: "Sortie, enregistrement, sûreté, porte ou salon",
      price: vip,
    },
  ];
  return (
    <div className="space-y-2">
      {cards.map((card, index) => (
        <motion.article
          key={card.title}
          className="rounded-2xl border border-[#e5e3dc] bg-white px-3.5 py-3 shadow-sm"
          {...rise(reduce, 0.12 + index * 0.16)}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
              <Icon name={card.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-gold-dark)]">{card.kicker}</p>
              <p className="text-sm font-semibold text-[var(--admin-navy)]">{card.title}</p>
              <p className="text-sm font-semibold leading-snug text-[var(--admin-navy)]">{card.line}</p>
              <p className="text-xs text-muted">{card.detail}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-[var(--admin-navy)]">{card.price}</p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

function LedgerScene({ reduce }: { reduce: boolean }) {
  const visa = VISA_EUR * 2;
  const rows = [
    {
      credit: true,
      title: "Virement reçu",
      meta: "2 novembre · New York",
      amount: `+${formatMoney(CHAUFFEUR_EUR + GREETER_ADULT_EUR + GREETER_CHILD_EUR + visa)}`,
      badge: "Encaissé",
    },
    {
      credit: false,
      title: "Chauffeur",
      meta: "12 novembre · Lyon → CDG",
      amount: `−${formatMoney(CHAUFFEUR_EUR)}`,
      badge: "Posté",
    },
    {
      credit: false,
      title: "VIP Airport",
      meta: "12 novembre · JFK",
      amount: `−${formatMoney(GREETER_ADULT_EUR + GREETER_CHILD_EUR)}`,
      badge: "Posté",
    },
    {
      credit: false,
      title: "ESTA",
      meta: "Camille Morel · Inès Morel",
      amount: `−${formatMoney(visa)}`,
      badge: "Posté",
    },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between rounded-2xl bg-[var(--admin-navy)] px-4 py-3 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Encours</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatMoney(0)}</p>
        </div>
        <p className="text-xs text-white/70">Compte à jour</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <motion.li
            key={row.title}
            className="flex items-start justify-between gap-3 rounded-xl border border-[#e9e8e5]/60 bg-white p-3 shadow-sm"
            {...rise(reduce, 0.12 + index * 0.1)}
          >
            <span className="flex min-w-0 items-start gap-3">
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  row.credit ? "bg-[var(--admin-gold)]/20 text-[var(--admin-navy)]" : "bg-[#efeeeb] text-[var(--admin-navy)]"
                }`}
              >
                <Icon name={row.credit ? "south_west" : "receipt_long"} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--admin-navy)]">{row.title}</span>
                <span className="block text-xs text-muted">{row.meta}</span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-bold text-[var(--admin-navy)]">{row.amount}</span>
              <span className="mt-1 inline-flex rounded-full border border-[#e5e3dc] bg-[#efeeeb] px-2 py-0.5 text-[10px] font-semibold text-[#44474c]">
                {row.badge}
              </span>
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const JOURNEYS = [
  {
    formality: "ESTA",
    place: "New York",
    people: "Camille Morel · Inès Morel",
    step: "Pièce",
    done: 5,
  },
  {
    formality: "ETA",
    place: "Londres",
    people: "Camille Morel",
    step: "Remplissage",
    done: 2,
  },
  {
    formality: "ETA-IL",
    place: "Tel-Aviv",
    people: "Camille Morel · Inès Morel",
    step: "Préparation",
    done: 1,
  },
] as const;

function FormalityScene({ reduce }: { reduce: boolean }) {
  return (
    <ul className="space-y-2">
      {JOURNEYS.map((trip, index) => (
        <motion.li
          key={trip.formality}
          className="rounded-2xl bg-[#0B192C] px-4 py-3 text-[#faf9f6] shadow-[0_8px_22px_rgba(11,25,44,0.12)]"
          {...rise(reduce, 0.08 + index * 0.14)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C5A880]">{trip.formality}</p>
              <p className="font-display text-base font-semibold leading-tight">{trip.place}</p>
              <p className="mt-0.5 text-xs text-white/70">{trip.people}</p>
            </div>
            <p className="shrink-0 text-[11px] font-semibold text-[#C5A880]">{trip.step}</p>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {Array.from({ length: 5 }, (_, mark) => (
              <span
                key={mark}
                className={`h-1 flex-1 rounded-full ${mark < trip.done ? "bg-[#C5A880]" : "bg-white/15"}`}
              />
            ))}
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
