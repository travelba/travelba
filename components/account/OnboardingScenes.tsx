"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/crm/icons";
import { CLIENT_ONBOARDING_STEPS } from "@/lib/crm/onboarding";

type StepId = (typeof CLIENT_ONBOARDING_STEPS)[number]["id"];

const ease = [0.22, 1, 0.36, 1] as const;

function rise(reduce: boolean, delay: number) {
  return {
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: 0.7, delay, ease },
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
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="relative h-44 overflow-hidden bg-[var(--admin-navy)]">
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#07111c_0%,#0b192c_46%,#1e3a5f_100%)]" />
        <div className="absolute left-1/2 top-7 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 items-center justify-center rounded-full border border-[var(--admin-gold)]/70">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--admin-gold)]">
            <span className="text-[10px] font-bold tracking-[0.18em] text-[var(--admin-gold)]">TBA</span>
          </div>
        </div>
        <p className="absolute inset-x-0 bottom-4 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--admin-gold)]">
          Passeport
        </p>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-5 h-px bg-[var(--admin-gold)] shadow-[0_0_18px_2px_rgba(197,168,128,0.9)]"
          initial={reduce ? { top: "78%", opacity: 0 } : { top: "16%", opacity: 0.95 }}
          animate={{ top: "82%", opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 1.35, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
      <div className="space-y-3 px-4 py-4">
        {["Prénom", "Nom"].map((label, index) => (
          <motion.div
            key={label}
            className="flex items-center justify-between gap-4 border-b border-[#efece4] pb-2.5"
            {...rise(reduce, 1.05 + index * 0.16)}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{label}</span>
            <span className="h-2 w-28 rounded-full bg-[#efece4]" />
          </motion.div>
        ))}
      </div>
    </article>
  );
}

function ItineraryScene({ reduce }: { reduce: boolean }) {
  const steps = [
    { icon: "flight" as const, label: "Vol du séjour" },
    { icon: "hotel" as const, label: "Hôtel du séjour" },
  ];
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="relative bg-[var(--admin-navy)] px-4 pb-4 pt-4">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#07111c_0%,#0b192c_55%,#1e3a5f_100%)]" />
        <div className="relative">
          <motion.p
            className="inline-flex rounded-full bg-[var(--admin-gold)] px-3 py-1 text-[11px] font-bold text-[var(--admin-navy)]"
            {...rise(reduce, 0.05)}
          >
            Publié
          </motion.p>
          <p className="relative mt-4 font-display text-xl font-bold text-white">Votre séjour</p>
        </div>
      </div>
      <div className="relative px-4 py-4">
        <motion.span
          aria-hidden
          className="absolute bottom-8 left-[1.85rem] top-8 w-px origin-top bg-[var(--admin-gold)]"
          initial={reduce ? { scaleY: 1 } : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.85, delay: 0.15, ease }}
        />
        <ul className="relative space-y-3">
          {steps.map((step, index) => (
            <motion.li key={step.label} className="flex items-center gap-3" {...rise(reduce, 0.45 + index * 0.22)}>
              <span className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-white">
                <Icon name={step.icon} className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-[var(--admin-navy)]">{step.label}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function ServicesScene({ reduce }: { reduce: boolean }) {
  const cards = [
    {
      icon: "directions_car" as const,
      title: "Transfert",
      detail: "Domicile et aéroport",
    },
    {
      icon: "verified" as const,
      title: "VIP Airport",
      detail: "Sortie, enregistrement, sûreté, porte ou salon",
    },
  ];
  return (
    <div className="space-y-3">
      <div className="relative mx-2 mb-1 flex items-center justify-between px-2">
        <span className="relative z-10 h-2.5 w-2.5 rounded-full bg-[var(--admin-navy)]" />
        <motion.span
          aria-hidden
          className="absolute inset-x-3 top-1/2 h-px origin-left -translate-y-1/2 bg-[var(--admin-gold)]"
          initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease }}
        />
        <span className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
          <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
        </span>
      </div>
      {cards.map((card, index) => (
        <motion.article
          key={card.title}
          className="flex items-center gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3.5 shadow-sm"
          initial={reduce ? false : { opacity: 0, x: index === 0 ? -18 : 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.65, delay: 0.55 + index * 0.16, ease }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--admin-navy)] text-white">
            <Icon name={card.icon} className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--admin-navy)]">{card.title}</p>
            <p className="text-xs text-muted">{card.detail}</p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

function LedgerScene({ reduce }: { reduce: boolean }) {
  return (
    <article className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Grand livre</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <motion.div className="flex items-center gap-3" {...rise(reduce, 0.1)}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--admin-peach)]">
            <Icon name="receipt_long" className="h-5 w-5 text-[var(--admin-navy)]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Écriture comptabilisée</p>
            <p className="text-xs text-muted">Visible dans Transactions</p>
          </div>
        </motion.div>
        <motion.span
          className="rounded-full bg-[var(--admin-navy)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
          initial={reduce ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.45, delay: 0.7, ease }}
        >
          Passée
        </motion.span>
      </div>
    </article>
  );
}

const STAMPS = [
  { label: "ESTA", place: "États-Unis", rotate: -8 },
  { label: "ETA", place: "Royaume-Uni", rotate: 7 },
  { label: "ETA-IL", place: "Israël", rotate: -4 },
] as const;

function FormalityScene({ reduce }: { reduce: boolean }) {
  return (
    <ul className="flex items-start justify-between gap-2 px-1 pt-2">
      {STAMPS.map((stamp, index) => (
        <motion.li
          key={stamp.label}
          className="flex flex-1 flex-col items-center"
          initial={
            reduce
              ? false
              : { opacity: 0, scale: 1.35, rotate: stamp.rotate - 12 }
          }
          animate={{ opacity: 1, scale: 1, rotate: stamp.rotate }}
          transition={reduce ? { duration: 0 } : { duration: 0.55, delay: 0.12 + index * 0.18, ease }}
        >
          <span className="flex h-[5.25rem] w-[5.25rem] items-center justify-center rounded-full border-2 border-[var(--admin-navy)] shadow-[inset_0_0_0_3px_#faf9f6,inset_0_0_0_4px_var(--admin-gold)]">
            <span className="text-[11px] font-bold tracking-[0.12em] text-[var(--admin-navy)]">{stamp.label}</span>
          </span>
          <span className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9e7e51]">
            {stamp.place}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
