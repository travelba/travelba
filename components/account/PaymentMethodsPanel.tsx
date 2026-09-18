"use client";

import { FormEvent, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import type { CrmPaymentMethod } from "@/lib/crm/types";
import { StatusChip } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = pk ? loadStripe(pk) : null;

function SetupForm() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    const { error: confirmError } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/mon-compte/profil/paiement`,
      },
    });
    setLoading(false);
    if (confirmError) {
      setError(confirmError.message || "Erreur Stripe");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <button className="admin-af-btn h-[54px] w-full rounded-full px-4 text-sm" disabled={loading}>
        {loading ? "Enregistrement…" : "Enregistrer la carte"}
      </button>
    </form>
  );
}

function brandLabel(brand: string | null) {
  if (!brand) return "Carte";
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    cartes_bancaires: "CB",
  };
  return map[brand.toLowerCase()] || brand.toUpperCase();
}

export function PaymentMethodsPanel({
  methods,
  clientSecret,
  configured,
}: {
  methods: CrmPaymentMethod[];
  clientSecret: string | null;
  configured: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  async function setDefault(id: string) {
    await fetch("/api/client/payment-methods", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/client/payment-methods?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--admin-gold)]/40 bg-[#fbf7ec] px-4 py-3 text-xs leading-relaxed text-[var(--admin-navy)]">
        Protection des données bancaires — cartes tokenisées Stripe (SetupIntent). Aucun numéro
        complet ni CVC n’est stocké chez Travelba.
      </div>

      <ul className="space-y-3">
        {methods.map((m) => (
          <li key={m.id} className="admin-af-card flex items-center gap-3 rounded-2xl p-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--admin-navy)] text-[#f8f6f0]">
              <Icon name="credit_card" className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[var(--admin-navy-deep)]">
                  {brandLabel(m.brand)} ···· {m.last4 || "••••"}
                </p>
                {m.is_default ? <StatusChip tone="gold">Par défaut</StatusChip> : null}
              </div>
              <p className="mt-0.5 font-label text-[11px] font-semibold tracking-[0.04em] text-muted">
                {m.exp_month && m.exp_year
                  ? `Expire ${String(m.exp_month).padStart(2, "0")}/${m.exp_year}`
                  : "Expiration inconnue"}
              </p>
              <div className="mt-2 flex gap-3">
                {!m.is_default ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--admin-navy)]"
                    onClick={() => setDefault(m.id)}
                  >
                    Définir par défaut
                  </button>
                ) : null}
                <button type="button" className="text-xs font-semibold text-accent" onClick={() => remove(m.id)}>
                  Retirer
                </button>
              </div>
            </div>
          </li>
        ))}
        {!methods.length ? (
          <li className="rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-8 text-center text-sm text-muted">
            Aucune carte enregistrée.
          </li>
        ) : null}
      </ul>

      {!configured ? (
        <p className="text-sm text-muted">
          L’enregistrement de carte sera disponible dès que Stripe sera configuré.
        </p>
      ) : clientSecret && stripePromise ? (
        adding ? (
          <div className="admin-af-card rounded-3xl p-5">
            <h2 className="mb-1 font-display text-lg font-bold text-[var(--admin-navy-deep)]">
              Ajouter une carte
            </h2>
            <p className="mb-4 text-xs text-muted">Saisie sécurisée Stripe — pas de saisie de numéro chez Travelba.</p>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <SetupForm />
            </Elements>
          </div>
        ) : (
          <button
            type="button"
            className="admin-af-btn h-[54px] w-full rounded-full px-4 text-sm"
            onClick={() => setAdding(true)}
          >
            Ajouter une carte
          </button>
        )
      ) : null}
    </div>
  );
}
