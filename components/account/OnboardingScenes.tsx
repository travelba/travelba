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
    birth: "15.06.1984",
    sex: "F",
    place: "Lyon",
    number: "24XY18302",
    issued: "02.06.2021",
    expiry: "01.06.2031",
    authority: "Préfecture du Rhône",
    mrz: "P<FRAMOREL<<CAMILLE<<<<<<<<<<<<<<<<<<<<<<<<<",
    mrz2: "24XY183021FRA8406158F3106017<<<<<<<<<<<<<<00",
  },
  {
    photo: "/onboarding/ines.jpg",
    given: "Inès",
    birth: "02.04.2012",
    sex: "F",
    place: "Lyon",
    number: "18KL90441",
    issued: "02.06.2026",
    expiry: "01.06.2031",
    authority: "Préfecture du Rhône",
    mrz: "P<FRAMOREL<<INES<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
    mrz2: "18KL904416FRA1204023F3106017<<<<<<<<<<<<<<04",
  },
] as const;

function PassportScene({ reduce }: { reduce: boolean }) {
  return (
    <ul className="space-y-2">
      {PASSPORTS.map((person, index) => (
        <motion.li
          key={person.number}
          className="overflow-hidden rounded-[10px] border border-[#d5c7b2] shadow-sm"
          style={{
            background:
              "radial-gradient(circle at 12% 20%, rgba(0,35,149,0.06), transparent 42%), radial-gradient(circle at 88% 80%, rgba(237,41,57,0.05), transparent 40%), #f6f1e6",
          }}
          {...rise(reduce, 0.08 + index * 0.16)}
        >
          <div className="flex items-start gap-2 px-2.5 pb-1 pt-1.5">
            <EuStars />
            <div className="min-w-0 flex-1 leading-none">
              <p className="text-[7px] font-bold tracking-[0.14em] text-[#1a3a6b]">UNION EUROPÉENNE</p>
              <p className="text-[6px] tracking-[0.12em] text-[#1a3a6b]/70">EUROPEAN UNION</p>
              <p className="mt-1 text-[7px] font-bold tracking-[0.06em] text-[#1c140c]">RÉPUBLIQUE FRANÇAISE</p>
              <p className="text-[6px] tracking-[0.08em] text-[#1c140c]/55">FRENCH REPUBLIC</p>
            </div>
            <div className="text-right leading-none">
              <p className="font-display text-[13px] font-bold tracking-[0.04em] text-[#7a1f2b]">PASSEPORT</p>
              <p className="text-[6.5px] tracking-[0.16em] text-[#7a1f2b]/70">PASSPORT</p>
            </div>
          </div>
          <div className="flex h-[3px]" aria-hidden>
            <span className="flex-1 bg-[#002395]" />
            <span className="flex-1 bg-white" />
            <span className="flex-1 bg-[#ED2939]" />
          </div>
          <div className="flex gap-2 px-2.5 py-1.5">
            <span className="relative h-[4.35rem] w-[3.3rem] shrink-0 overflow-hidden bg-[#ece7df] ring-1 ring-[#c9b89a]">
              <img src={person.photo} alt="" className="h-full w-full object-cover object-[center_18%]" />
              {index === 0 ? (
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 h-px bg-[#002395]/80 shadow-[0_0_8px_1px_rgba(0,35,149,0.45)]"
                  initial={reduce ? { top: "90%", opacity: 0 } : { top: "6%", opacity: 0.9 }}
                  animate={{ top: "94%", opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 1.15, ease: [0.4, 0, 0.2, 1] }}
                />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-[auto_1fr] gap-x-3">
                <PassportLine fr="Type" en="Type" value="P" />
                <PassportLine fr="Code" en="Code" value="FRA" />
              </div>
              <PassportLine fr="Passeport n°" en="Passport no." value={person.number} />
              <PassportLine fr="Nom" en="Surname" value="MOREL" />
              <div className="grid grid-cols-2 gap-x-2">
                <PassportLine fr="Prénoms" en="Given names" value={person.given} />
                <PassportLine fr="Sexe" en="Sex" value={person.sex} />
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <PassportLine fr="Naissance" en="Date of birth" value={person.birth} />
                <PassportLine fr="Lieu" en="Place of birth" value={person.place} />
              </div>
              <PassportLine fr="Nationalité" en="Nationality" value="Française" />
              <div className="grid grid-cols-2 gap-x-2">
                <PassportLine fr="Délivrance" en="Date of issue" value={person.issued} />
                <PassportLine fr="Expiration" en="Date of expiry" value={person.expiry} />
              </div>
              <PassportLine fr="Autorité" en="Authority" value={person.authority} />
            </div>
          </div>
          <div className="border-t border-[#e4d5c0] bg-[#efe6d4] px-2 py-1 font-mono text-[6.5px] leading-[1.15] tracking-[0.01em] text-[#1a140f]">
            <p className="overflow-hidden whitespace-nowrap">{person.mrz}</p>
            <p className="overflow-hidden whitespace-nowrap">{person.mrz2}</p>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

const EU_STARS = [
  ["12.00", "4.80"],
  ["15.60", "5.76"],
  ["18.24", "8.40"],
  ["19.20", "12.00"],
  ["18.24", "15.60"],
  ["15.60", "18.24"],
  ["12.00", "19.20"],
  ["8.40", "18.24"],
  ["5.76", "15.60"],
  ["4.80", "12.00"],
  ["5.76", "8.40"],
  ["8.40", "5.76"],
] as const;

function EuStars() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0" aria-hidden>
      {EU_STARS.map(([cx, cy]) => (
        <circle key={cx + cy} cx={cx} cy={cy} r="0.9" fill="#1a3a6b" />
      ))}
    </svg>
  );
}

function PassportLine({ fr, en, value }: { fr: string; en: string; value: string }) {
  return (
    <p className="min-w-0 leading-none">
      <span className="block truncate text-[6px] font-semibold uppercase tracking-[0.04em] text-[#8d7348]">
        {fr}
        <span className="font-normal normal-case tracking-normal text-[#b19774]"> / {en}</span>
      </span>
      <span className="block truncate text-[10px] font-semibold leading-tight text-[#1c140c]">{value}</span>
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
