"use client";

import { FormEvent, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import type { CrmPaymentMethod } from "@/lib/crm/types";

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
      <button className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={loading}>
        {loading ? "Enregistrement…" : "Enregistrer la carte"}
      </button>
    </form>
  );
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
    <div className="mt-6 space-y-6">
      <ul className="space-y-2">
        {methods.map((m) => (
          <li key={m.id} className="admin-af-card flex items-center justify-between rounded-2xl px-4 py-3">
            <p className="text-sm font-medium">
              {(m.brand || "Carte").toUpperCase()} ···· {m.last4}{" "}
              {m.exp_month && m.exp_year ? `· ${m.exp_month}/${m.exp_year}` : ""}
              {m.is_default ? " · défaut" : ""}
            </p>
            <div className="flex gap-3">
              {!m.is_default ? (
                <button type="button" className="text-xs font-semibold" onClick={() => setDefault(m.id)}>
                  Par défaut
                </button>
              ) : null}
              <button type="button" className="text-xs font-semibold text-accent" onClick={() => remove(m.id)}>
                Retirer
              </button>
            </div>
          </li>
        ))}
        {!methods.length ? <li className="text-sm text-muted">Aucune carte enregistrée.</li> : null}
      </ul>
      {!configured ? (
        <p className="text-sm text-muted">
          L’enregistrement de carte sera disponible dès que Stripe sera configuré.
        </p>
      ) : clientSecret && stripePromise ? (
        <div className="admin-af-card rounded-3xl p-5">
          <h2 className="mb-4 font-display text-lg font-bold">Ajouter une carte</h2>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <SetupForm />
          </Elements>
        </div>
      ) : null}
    </div>
  );
}
