"use client";

import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = key ? loadStripe(key) : null;

function HoldForm({ onDone, onFail }: { onDone: () => void; onFail: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function authorize() {
    if (!stripe || !elements) return;
    setBusy(true);
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    setBusy(false);
    if (error) {
      onFail(error.message || "L’autorisation a échoué.");
      return;
    }
    if (paymentIntent?.status === "requires_capture") onDone();
    else onFail("L’autorisation n’est pas confirmée.");
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      <button type="button" className="h-btn h-12 w-full text-sm font-semibold" disabled={busy} onClick={() => void authorize()}>
        {busy ? "Autorisation…" : "Autoriser la carte"}
      </button>
    </div>
  );
}

export function HotelCardHold({
  clientSecret,
  onDone,
  onFail,
}: {
  clientSecret: string;
  onDone: () => void;
  onFail: (message: string) => void;
}) {
  if (!stripePromise) return <p className="text-sm h-gold">Stripe n’est pas configuré.</p>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <HoldForm onDone={onDone} onFail={onFail} />
    </Elements>
  );
}
