"use client";

import { useEffect } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = key ? loadStripe(key) : null;

function HoldForm({
  confirmRef,
  onComplete,
  onFail,
}: {
  confirmRef: { current: (() => Promise<boolean>) | null };
  onComplete: (complete: boolean) => void;
  onFail: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    confirmRef.current = async () => {
      if (!stripe || !elements) return false;
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (error) {
        onFail(error.message || "L’autorisation a échoué.");
        return false;
      }
      if (paymentIntent?.status === "requires_capture") return true;
      onFail("L’autorisation n’est pas confirmée.");
      return false;
    };
    return () => {
      confirmRef.current = null;
    };
  }, [stripe, elements, confirmRef, onFail]);

  return <PaymentElement onChange={(event) => onComplete(event.complete)} />;
}

/** Saisie Stripe. L’autorisation part quand l’écran appelle confirmRef, pas depuis un second bouton. */
export function HotelCardHold({
  clientSecret,
  confirmRef,
  onComplete,
  onFail,
}: {
  clientSecret: string;
  confirmRef: { current: (() => Promise<boolean>) | null };
  onComplete: (complete: boolean) => void;
  onFail: (message: string) => void;
}) {
  if (!stripePromise) return <p className="text-sm h-gold">Stripe n’est pas configuré.</p>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <HoldForm confirmRef={confirmRef} onComplete={onComplete} onFail={onFail} />
    </Elements>
  );
}
