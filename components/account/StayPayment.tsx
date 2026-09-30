"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { BusyBar } from "@/components/crm/BusyBar";
import type { PayerKind } from "@/lib/crm/payer";
import { STAY_PAY_LABELS, type StayPayMethod } from "@/lib/crm/stripe-pay";

const stripeCache = new Map<string, ReturnType<typeof loadStripe>>();

function stripeFor(key: string) {
  const existing = stripeCache.get(key);
  if (existing) return existing;
  const created = loadStripe(key);
  stripeCache.set(key, created);
  return created;
}

type TransferView = {
  iban: string;
  bic: string;
  accountHolder: string;
  reference: string;
  currency: string;
};

export function StayPayment({
  bookingId,
  reference,
  payerKind,
  companyName,
  canPay,
  methods,
  amountLabel,
  stripeKey,
}: {
  bookingId: string;
  reference: string;
  payerKind: PayerKind;
  companyName: string | null;
  canPay: boolean;
  methods: StayPayMethod[];
  amountLabel: string | null;
  stripeKey: string | null;
}) {
  const [method, setMethod] = useState<StayPayMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferView | null>(null);
  const [paid, setPaid] = useState(false);

  const society = companyName?.trim() || "votre société";

  async function choose(next: StayPayMethod) {
    setMethod(next);
    setError(null);
    setClientSecret(null);
    setTransfer(null);
    setPaid(false);
    if (!canPay || !stripeKey || !amountLabel) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/client/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Le règlement n’a pas pu démarrer.");
        return;
      }
      if (json.alreadyPaid) {
        setPaid(true);
        return;
      }
      if (json.transfer) {
        setTransfer(json.transfer as TransferView);
        return;
      }
      if (typeof json.clientSecret === "string") setClientSecret(json.clientSecret);
      else setError("Le règlement n’a pas pu démarrer.");
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[1.35rem] border border-[#e5e3dc] bg-white p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Règlement</p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
          {payerKind === "company" ? `Ce voyage est réglé par ${society}.` : "Régler ce voyage"}
        </h2>
        {amountLabel ? <p className="mt-1 text-sm text-muted">{amountLabel}</p> : null}
      </div>

      {payerKind === "company" && !canPay ? (
        <p className="text-sm text-muted">Le règlement se fait par {society}. Vous n’avez rien à payer ici.</p>
      ) : null}

      {canPay && !methods.length ? (
        <p className="text-sm text-muted">Le prélèvement et le virement sont ouverts pour un séjour en euros.</p>
      ) : null}

      {canPay && methods.length ? (
        <div className="grid gap-2" role="radiogroup" aria-label="Moyen de règlement">
          {methods.map((item) => {
            const selected = method === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={selected}
                onClick={() => void choose(item)}
                className={`rounded-2xl px-4 py-3 text-left ${
                  selected
                    ? "bg-[var(--admin-navy)] text-white"
                    : "bg-[#f7f6f3] text-[var(--admin-navy)]"
                }`}
              >
                <span className="text-sm font-semibold">{STAY_PAY_LABELS[item]}</span>
                {!stripeKey ? (
                  <span className={`mt-0.5 block text-xs ${selected ? "text-white/75" : "text-muted"}`}>
                    Ce moyen n’est pas encore ouvert.
                  </span>
                ) : !amountLabel ? (
                  <span className={`mt-0.5 block text-xs ${selected ? "text-white/75" : "text-muted"}`}>
                    Rien à régler pour l’instant.
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <BusyBar active={busy} label="Préparation du règlement…" />
      {paid ? <p className="text-sm text-[var(--admin-navy)]">Ce règlement est déjà enregistré.</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}

      {transfer ? (
        <dl className="space-y-2 rounded-2xl bg-[#f7f6f3] p-4 text-sm text-[var(--admin-navy)]">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">IBAN</dt>
            <dd className="mt-0.5 font-semibold tracking-wide">{transfer.iban}</dd>
          </div>
          {transfer.bic ? (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">BIC</dt>
              <dd className="mt-0.5 font-semibold">{transfer.bic}</dd>
            </div>
          ) : null}
          {transfer.accountHolder ? (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Titulaire</dt>
              <dd className="mt-0.5">{transfer.accountHolder}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Référence à indiquer</dt>
            <dd className="mt-0.5 font-semibold">{transfer.reference || reference}</dd>
          </div>
          <p className="text-xs text-muted">Le virement est rapproché dès que Stripe le reçoit.</p>
        </dl>
      ) : null}

      {clientSecret && stripeKey && method && method !== "customer_balance" ? (
        <Elements
          stripe={stripeFor(stripeKey)}
          options={{
            clientSecret,
            appearance: {
              variables: {
                colorPrimary: "#0B192C",
                colorBackground: "#ffffff",
                borderRadius: "16px",
                fontFamily: "Inter, sans-serif",
              },
            },
          }}
        >
          {method === "apple_pay" ? (
            <ApplePayForm reference={reference} />
          ) : (
            <CardPayForm reference={reference} sepa={method === "sepa_debit"} />
          )}
        </Elements>
      ) : null}
    </section>
  );
}

function paymentReturnUrl(reference: string) {
  return `${window.location.origin}/mon-compte/reservations/${encodeURIComponent(reference)}`;
}

function CardPayForm({ reference, sepa }: { reference: string; sepa: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "Vérifiez les informations.");
      setBusy(false);
      return;
    }
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: paymentReturnUrl(reference) },
      redirect: "if_required",
    });
    setBusy(false);
    if (confirmError) {
      setError(confirmError.message || "Le règlement n’a pas abouti.");
      return;
    }
    if (paymentIntent?.status === "processing") {
      setDone("Prélèvement lancé. Il peut prendre quelques jours.");
      return;
    }
    setDone("Règlement envoyé.");
  }

  return (
    <div className="space-y-3">
      <PaymentElement
        options={{
          layout: "tabs",
          wallets: { applePay: "never", googlePay: "never", link: "never" },
        }}
      />
      <BusyBar active={busy} label={sepa ? "Prélèvement…" : "Règlement…"} />
      {done ? <p className="text-sm text-[var(--admin-navy)]">{done}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <button
        type="button"
        onClick={() => void pay()}
        disabled={!stripe || busy}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {sepa ? "Lancer le prélèvement" : "Payer par carte"}
      </button>
    </div>
  );
}

function ApplePayForm({ reference }: { reference: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <ExpressCheckoutElement
        options={{ paymentMethods: { applePay: "always", googlePay: "never", link: "never" } }}
        onReady={(event) => setReady(Boolean(event.availablePaymentMethods?.applePay))}
        onClick={(event) => event.resolve()}
        onConfirm={async (event) => {
          if (!stripe || !elements) return;
          const { error: submitError } = await elements.submit();
          if (submitError) {
            event.paymentFailed({ message: submitError.message });
            setError(submitError.message || "Apple Pay n’a pas abouti.");
            return;
          }
          const { error: confirmError } = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: paymentReturnUrl(reference) },
            redirect: "if_required",
          });
          if (confirmError) {
            event.paymentFailed({ message: confirmError.message });
            setError(confirmError.message || "Apple Pay n’a pas abouti.");
          }
        }}
      />
      {ready === false ? (
        <p className="text-sm text-muted">Apple Pay s’ouvre sur iPhone, iPad ou Safari.</p>
      ) : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
