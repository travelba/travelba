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
    given: "CAMILLE",
    birth: "15 06 1984",
    sex: "F",
    height: "1,68 m",
    eyes: "Marron",
    place: "LYON",
    home: "14 QUAI SAINT-VINCENT\n69001  LYON",
    number: "24XY18302",
    issued: "02 06 2021",
    expiry: "01 06 2031",
    authority: "Préfecture du Rhône",
    mrz: "P<FRAMOREL<<CAMILLE<<<<<<<<<<<<<<<<<<<<<<<<<",
    mrz2: "24XY183021FRA8406158F3106017<<<<<<<<<<<<<<00",
  },
  {
    photo: "/onboarding/ines.jpg",
    given: "INÈS",
    birth: "02 04 2012",
    sex: "F",
    height: "1,64 m",
    eyes: "Marron",
    place: "LYON",
    home: "14 QUAI SAINT-VINCENT\n69001  LYON",
    number: "18KL90441",
    issued: "02 06 2026",
    expiry: "01 06 2031",
    authority: "Préfecture du Rhône",
    mrz: "P<FRAMOREL<<INES<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
    mrz2: "18KL904416FRA1204023F3106017<<<<<<<<<<<<<<04",
  },
] as const;

function PassportScene({ reduce }: { reduce: boolean }) {
  return (
    <ul className="space-y-2">
      {PASSPORTS.map((person, index) => (
        <motion.li key={person.number} {...rise(reduce, 0.08 + index * 0.16)}>
          <FrenchPassport person={person} />
        </motion.li>
      ))}
    </ul>
  );
}

function FrenchPassport({ person }: { person: (typeof PASSPORTS)[number] }) {
  return (
    <article
      className="relative overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgba(28,24,18,0.18)] ring-1 ring-[#d9c7aa]"
      style={{ aspectRatio: "125 / 88", containerType: "inline-size" }}
    >
      <PassportPaper />
      <div className="relative flex h-full flex-col">
        <p
          className="pt-[1.8%] text-center font-bold leading-none tracking-[0.06em] text-[#1a3f86]"
          style={{ fontSize: "3.05cqi" }}
        >
          RÉPUBLIQUE FRANÇAISE
        </p>
        <div className="mt-[1.1%] flex items-start gap-[1.5%] px-[2.2%]">
          <div className="w-[24%] shrink-0 leading-none">
            <p className="font-bold tracking-[0.03em] text-[#1a4f9c]" style={{ fontSize: "2.7cqi" }}>
              PASSEPORT
            </p>
            <p className="tracking-[0.14em] text-[#1a4f9c]" style={{ fontSize: "1.55cqi" }}>
              PASSPORT
            </p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[0.55fr_1.15fr_1fr] gap-x-[2%]">
            <DocField label="Type / Type" value="P" />
            <DocField label="Code du pays / Country code" value="FRA" />
            <DocField label="Passeport n° / Passport no." value={person.number} />
          </div>
          <RfMark />
        </div>
        <div className="mt-[1%] flex min-h-0 flex-1 gap-[2%] px-[2.2%] pb-[0.4%]">
          <img
            src={person.photo}
            alt=""
            className="h-full w-[26%] shrink-0 bg-[#eceae6] object-cover object-[center_16%] ring-1 ring-black/15"
          />
          <div className="relative min-w-0 flex-1">
            <img
              src={person.photo}
              alt=""
              aria-hidden
              className="pointer-events-none absolute right-[4%] top-[2%] h-[70%] w-[42%] object-cover object-[center_18%] opacity-30 mix-blend-multiply"
              style={{
                maskImage: "radial-gradient(ellipse at 50% 40%, #000 28%, transparent 68%)",
                WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, #000 28%, transparent 68%)",
              }}
            />
            <div className="relative flex h-full flex-col justify-between">
              <DocField label="Nom / Surname (1)" value="MOREL" />
              <DocField label="Prénoms / Given names (2)" value={person.given} />
              <div className="grid grid-cols-[1.25fr_0.42fr_0.72fr_1.2fr] gap-x-[1%]">
                <DocField label="Nationalité / Nationality (3)" value="Française" />
                <DocField label="Sexe / Sex (5)" value={person.sex} />
                <DocField label="Taille / Height (12)" value={person.height} />
                <DocField label="Couleur des yeux / Colour of eyes (13)" value={person.eyes} />
              </div>
              <div className="grid grid-cols-2 gap-x-[2%]">
                <DocField label="Date de naissance / Date of birth (4)" value={person.birth} />
                <DocField label="Lieu de naissance / Place of birth (6)" value={person.place} />
              </div>
              <div className="grid grid-cols-2 gap-x-[2%]">
                <div className="flex flex-col justify-between">
                  <DocField label="Date de délivrance / Date of issue (7)" value={person.issued} />
                  <DocField label="Autorité / Authority (9)" value={person.authority} />
                </div>
                <DocField label="Domicile / Residence (11)" value={person.home} />
              </div>
              <DocField label="Date d'expiration / Date of expiry (8)" value={person.expiry} />
            </div>
          </div>
        </div>
        <div
          className="px-[2%] pb-[1.5%] font-mono leading-none tracking-[-0.03em] text-[#16120e]"
          style={{ fontSize: "2.85cqi" }}
        >
          <p className="overflow-hidden whitespace-nowrap">{person.mrz}</p>
          <p className="mt-[0.5%] overflow-hidden whitespace-nowrap">{person.mrz2}</p>
        </div>
      </div>
    </article>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <p className="min-w-0 leading-none">
      <span className="block truncate text-[#5e584f]" style={{ fontSize: "1.22cqi" }}>
        {label}
      </span>
      {value.split("\n").map((line) => (
        <span
          key={line}
          className="block truncate font-semibold leading-[1.08] text-[#141414]"
          style={{ fontSize: "2.05cqi" }}
        >
          {line.split("  ").map((part, index) => (
            <span key={part} style={index ? { marginLeft: "0.45em" } : undefined}>
              {part}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

function RfMark() {
  return (
    <svg viewBox="0 0 36 40" className="mt-[0.5%] shrink-0" style={{ width: "6.6cqi" }} aria-hidden>
      <polygon
        points="18,1.5 34,10.5 34,29.5 18,38.5 2,29.5 2,10.5"
        fill="rgba(255,252,247,0.45)"
        stroke="#3c4858"
        strokeWidth="1.25"
      />
      <text
        x="18"
        y="24.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#2a3544"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        RF
      </text>
    </svg>
  );
}

function PassportPaper() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 16% 42%, rgba(86,146,186,0.22), transparent 48%), radial-gradient(ellipse at 78% 38%, rgba(214,146,154,0.18), transparent 44%), radial-gradient(ellipse at 48% 88%, rgba(196,176,130,0.12), transparent 42%), linear-gradient(180deg, #fbf7f0 0%, #f3eadc 100%)",
        }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-50" viewBox="0 0 125 88" preserveAspectRatio="none">
        <path d="M0 8 Q 31 5 62 8 T 125 8" fill="none" stroke="#d5e2ee" strokeWidth="0.35" />
        <path d="M0 16 Q 31 13 62 16 T 125 16" fill="none" stroke="#ead5cf" strokeWidth="0.35" />
        <path d="M0 24 Q 31 21 62 24 T 125 24" fill="none" stroke="#d5e2ee" strokeWidth="0.35" />
        <path d="M0 32 Q 31 29 62 32 T 125 32" fill="none" stroke="#ead5cf" strokeWidth="0.35" />
        <path d="M0 40 Q 31 37 62 40 T 125 40" fill="none" stroke="#d5e2ee" strokeWidth="0.35" />
        <path d="M0 48 Q 31 45 62 48 T 125 48" fill="none" stroke="#ead5cf" strokeWidth="0.35" />
        <path d="M0 56 Q 31 53 62 56 T 125 56" fill="none" stroke="#d5e2ee" strokeWidth="0.35" />
        <path d="M0 64 Q 31 61 62 64 T 125 64" fill="none" stroke="#ead5cf" strokeWidth="0.35" />
        <path d="M0 72 Q 31 69 62 72 T 125 72" fill="none" stroke="#d5e2ee" strokeWidth="0.35" />
        <path d="M0 80 Q 31 77 62 80 T 125 80" fill="none" stroke="#ead5cf" strokeWidth="0.35" />
      </svg>
    </div>
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
