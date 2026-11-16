"use client";

import { FormEvent, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = key ? loadStripe(key) : null;

function CardForm({ onSaved }: { onSaved: (last4: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    const { error: stripeError, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (stripeError || !setupIntent || setupIntent.status !== "succeeded") {
      setLoading(false);
      setError(stripeError?.message || "La carte n’a pas été acceptée.");
      return;
    }
    const response = await fetch("/api/auth/inscription/carte/confirmer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setupIntentId: setupIntent.id }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string; last4?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "La carte n’a pas été enregistrée.");
      return;
    }
    onSaved(json.last4 || "");
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <PaymentElement />
      {error ? <p className="text-sm text-[var(--admin-red,#9b3a3a)]">{error}</p> : null}
      <button type="submit" disabled={loading || !stripe} className="h-11 w-full rounded-full bg-[var(--admin-navy)] text-sm font-semibold text-white disabled:opacity-60">
        {loading ? "Vérification…" : "Enregistrer la carte"}
      </button>
    </form>
  );
}

export function SignupCard({ onSaved }: { onSaved: (last4: string) => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/inscription/carte", { method: "POST" });
    const json = (await response.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
    setLoading(false);
    if (!response.ok || !json.clientSecret) {
      setError(json.error || "L’enregistrement de la carte n’est pas ouvert.");
      return;
    }
    setSecret(json.clientSecret);
  }

  if (!stripePromise) {
    return <p className="text-sm text-[var(--admin-navy)]">L’enregistrement de la carte n’est pas ouvert.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-[var(--admin-navy)]">
        Votre carte sert de garantie. Aucun montant n’est pris maintenant. Le séjour est encaissé lorsque l’hôtel est confirmé.
      </p>
      {secret ? (
        <Elements stripe={stripePromise} options={{ clientSecret: secret }}>
          <CardForm onSaved={onSaved} />
        </Elements>
      ) : (
        <button type="button" disabled={loading} onClick={() => void open()} className="h-11 w-full rounded-full bg-[var(--admin-navy)] text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Préparation…" : "Ajouter une carte"}
        </button>
      )}
      {error ? <p className="text-sm text-[var(--admin-red,#9b3a3a)]">{error}</p> : null}
    </div>
  );
}
