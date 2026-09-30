"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/crm/icons";
import { CHAUFFEUR_EUR, GREETER_ADULT_EUR, GREETER_CHILD_EUR, VISA_EUR } from "@/lib/crm/extras";
import { formatMoney } from "@/lib/crm/money";
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

function PassportScene({ reduce }: { reduce: boolean }) {
  const people = [
    { name: "Camille Morel", number: "24XY18302", who: "Titulaire" },
    { name: "Inès Morel", number: "18KL90441", who: "Enfant" },
  ];
  return (
    <ul className="space-y-2">
      {people.map((person, index) => (
        <motion.li
          key={person.number}
          className="flex items-center gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-3 py-3 shadow-sm"
          {...rise(reduce, 0.15 + index * 0.18)}
        >
          <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--admin-navy)]">
            <span className="absolute inset-0 bg-[linear-gradient(165deg,#07111c,#1e3a5f)]" />
            <span className="absolute inset-x-0 top-1.5 text-center text-[8px] font-bold tracking-[0.14em] text-[var(--admin-gold)]">
              FRA
            </span>
            <span className="absolute inset-x-1 bottom-1.5 text-center text-[7px] font-semibold uppercase tracking-wide text-white/80">
              Passeport
            </span>
            {index === 0 ? (
              <motion.span
                aria-hidden
                className="absolute inset-x-1 h-px bg-[var(--admin-gold)] shadow-[0_0_10px_1px_rgba(197,168,128,0.9)]"
                initial={reduce ? { top: "80%", opacity: 0 } : { top: "18%", opacity: 1 }}
                animate={{ top: "82%", opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[var(--admin-navy)]">{person.name}</span>
            <span className="mt-0.5 block text-xs text-[var(--admin-navy)]">Passeport · {person.number}</span>
            <span className="block text-xs text-muted">France · expire le 1 juin 2031</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-[#9e7e51]">{person.who}</span>
            <span className="mt-1 inline-flex rounded-full bg-[var(--admin-navy)] px-2 py-0.5 text-[10px] font-bold text-white">
              Valide
            </span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function ItineraryScene({ reduce }: { reduce: boolean }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="relative px-4 pb-4 pt-4">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#07111c_0%,#0b192c_52%,#1e3a5f_100%)]" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              12 — 14 novembre 2026
            </p>
            <span className="rounded-full bg-[var(--admin-gold)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--admin-navy)]">
              Publié
            </span>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold text-white">New York</h2>
          <p className="mt-1 text-xs text-white/75">Camille Morel · Inès Morel</p>
        </div>
      </div>
      <div className="px-3.5 pb-2 pt-3">
        <p className="px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
          Jeudi 12 novembre
        </p>
        <motion.div className="mt-2 flex items-start gap-3 py-2" {...rise(reduce, 0.2)}>
          <Icon name="flight" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--admin-gold-dark)]" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
              Vol · 10h15 → 12h40
            </p>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Paris CDG → New York JFK</p>
            <p className="text-xs text-muted">EX 100 · 2 billets</p>
          </div>
        </motion.div>
        <motion.div className="flex items-start gap-3 border-t border-[#efece4] py-2" {...rise(reduce, 0.38)}>
          <Icon name="hotel" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--admin-gold-dark)]" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">Hôtel</p>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Maison Horizon</p>
            <p className="text-xs text-muted">New York · 2 nuits</p>
          </div>
        </motion.div>
      </div>
    </article>
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
