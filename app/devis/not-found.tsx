import Link from "next/link";
import { BrandMark } from "@/components/crm/ui";

export default function QuoteNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--aura-surface)] px-4 py-10">
      <section className="aura-card w-full max-w-md bg-white p-8 text-center">
        <div className="mb-8 flex justify-center">
          <BrandMark href="/" subtitle="Devis voyage" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">
          Lien indisponible
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-[var(--admin-navy)]">
          Ce devis n&apos;est plus accessible
        </h1>
        <p className="mt-3 text-sm text-muted">
          Demandez un nouveau lien sécurisé à votre conseiller Travelba.
        </p>
        <Link
          href="/connexion"
          className="mt-6 inline-flex rounded-full bg-[var(--aura-blue)] px-5 py-3 text-sm font-bold text-white"
        >
          Accéder à mon espace
        </Link>
      </section>
    </main>
  );
}
