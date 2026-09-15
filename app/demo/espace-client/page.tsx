import Link from "next/link";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { siteConfig } from "@/lib/site";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const TABS = [
  { label: "Accueil", href: "#accueil" },
  { label: "Réservations", href: "#reservations" },
  { label: "Transactions", href: "#transactions" },
  { label: "Compte", href: "#compte" },
] as const;

export const metadata = {
  title: `Espace client exemple — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default function DemoClientSpacePage() {
  return (
    <div
      className={`account-app min-h-screen ${display.variable} ${sans.variable}`}
    >
      <div id="accueil" className="mx-auto max-w-[430px] scroll-mt-4 px-4 pb-28 pt-4">
        <div className="mb-4 rounded-2xl bg-[var(--admin-navy)] px-4 py-3 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
            Espace client exemple
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            Marie Dupont · TBA Aura
          </p>
          <p className="mt-1 text-xs text-white/70">
            Démo publique et interactive du CRM client — aucune connexion
            nécessaire.
          </p>
        </div>

        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Ravi de vous revoir ✨</p>
            <h1 className="mt-1 font-display text-[1.85rem] font-extrabold text-[var(--admin-navy)]">
              Bonjour Marie
            </h1>
          </div>
          <span className="rounded-full bg-[var(--aura-blue-soft)] px-3 py-2 text-[11px] font-bold uppercase text-[var(--aura-blue)]">
            Explorer Club
          </span>
        </header>

        <article
          id="reservations"
          className="relative mt-5 min-h-[300px] scroll-mt-4 overflow-hidden rounded-[1.5rem] bg-[var(--admin-navy)] text-white shadow-xl"
        >
          <div
            className="absolute inset-0 bg-cover bg-center opacity-55"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-transparent" />
          <div className="relative flex min-h-[300px] flex-col justify-end space-y-3 p-5">
            <div className="flex justify-between">
              <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-[var(--admin-navy)]">
                ● Départ imminent
              </span>
              <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold">
                J-28
              </span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--aura-blue-soft)]">
              Escapade automnale
            </p>
            <h2 className="font-display text-2xl font-extrabold">Kyoto, Japon</h2>
            <p className="text-sm text-white/75">14 — 24 oct. 2026 (10 j)</p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-3 text-sm">
              <div>
                <p className="text-[10px] uppercase text-white/55">Vol</p>
                <p className="font-semibold">AF 292 CDG → KIX</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-white/55">Séjour</p>
                <p className="font-semibold">Hoshinoya Kyoto</p>
              </div>
            </div>
            <a
              href="#activites"
              className="flex h-12 items-center justify-center rounded-full bg-white text-sm font-bold text-[var(--admin-navy)]"
            >
              Voir l&apos;itinéraire →
            </a>
          </div>
        </article>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Link
            href="/mon-compte/documents"
            className="rounded-2xl bg-white px-2 py-3.5 text-center text-[11px] font-bold text-[var(--admin-navy)] shadow-sm"
          >
            Billets & Vouchers
          </Link>
          <Link
            href="/mon-compte/paiements"
            className="rounded-2xl bg-white px-2 py-3.5 text-center text-[11px] font-bold text-[var(--admin-navy)] shadow-sm"
          >
            + Fonds (Revolut)
          </Link>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            className="rounded-2xl bg-white px-2 py-3.5 text-center text-[11px] font-bold text-[var(--admin-navy)] shadow-sm"
          >
            Concierge Privé
          </a>
        </div>

        <section
          id="transactions"
          className="aura-card mt-4 scroll-mt-4 rounded-[1.5rem] bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
              Votre encours voyage
            </h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              Garanti
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted">Solde disponible</p>
              <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
                3 450,00 €
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted">Dépenses engagées</p>
              <p className="font-display text-lg font-bold text-muted">6 220,00 €</p>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[64.3%] rounded-full bg-[var(--aura-blue)]" />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>64,3 % utilisé</span>
            <span>Disponible 3 450,00 €</span>
          </div>
        </section>

        <section id="activites" className="mt-5 scroll-mt-4 space-y-2">
          <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
            Dernières activités
          </h3>
          {[
            ["Kitcho Arashiyama", "−420,00 €", "Confirmé"],
            ["Apport Revolut Pay", "+1 500,00 €", "Reçu"],
            ["Surclassement Air France", "−290,00 €", "Confirmé"],
          ].map(([label, amount, status]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--admin-navy)]">{label}</p>
                <p className="text-xs text-muted">{status}</p>
              </div>
              <p
                className={`text-sm font-bold ${
                  String(amount).startsWith("+")
                    ? "text-emerald-600"
                    : "text-[var(--admin-navy)]"
                }`}
              >
                {amount}
              </p>
            </div>
          ))}
        </section>

        <div id="compte" className="mt-6 grid scroll-mt-4 gap-2">
          <Link
            href="/connexion"
            className="rounded-full bg-[var(--admin-navy)] px-4 py-3 text-center text-sm font-bold text-white"
          >
            Se connecter au vrai portail
          </Link>
          <Link
            href="/admin/login"
            className="rounded-full border border-slate-200 bg-white px-4 py-3 text-center text-sm font-bold text-[var(--admin-navy)]"
          >
            Back-office agence
          </Link>
        </div>
      </div>

      <nav className="account-tabbar">
        <div className="mx-auto grid max-w-[430px] grid-cols-4">
          {TABS.map((tab, i) => (
            <a
              key={tab.label}
              href={tab.href}
              className={`flex min-h-[58px] flex-col items-center justify-center text-[10px] font-semibold ${
                i === 0 ? "text-[var(--admin-navy)]" : "text-slate-500"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
