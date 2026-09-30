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
import { CLIENT_PREVIEW_NOTE, useClientPreview } from "@/components/account/client-preview";
import { WireInstructions } from "@/components/account/WireInstructions";
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
  partLabel?: string;
};

export type ClientPayPart = {
  kind: PayerKind;
  mention: string;
  amountLabel: string | null;
  payable: boolean;
  canPay: boolean;
  methods: StayPayMethod[];
  companyName: string | null;
};

export function StayPayment({
  parts,
  stripeKey,
  compact = false,
}: {
  parts: ClientPayPart[];
  stripeKey: string | null;
  /** Les montants sont déjà dans l’encours. Ici, seulement le règlement. */
  compact?: boolean;
}) {
  const [openKind, setOpenKind] = useState<PayerKind | null>(null);
  const [method, setMethod] = useState<StayPayMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferView | null>(null);
  const [paid, setPaid] = useState(false);
  const preview = useClientPreview();

  async function choose(part: ClientPayPart, next: StayPayMethod) {
    setOpenKind(part.kind);
    setMethod(next);
    setError(null);
    setClientSecret(null);
    setTransfer(null);
    setPaid(false);
    if (!part.canPay || !part.payable || !part.amountLabel) return;
    if (preview) {
      setError(CLIENT_PREVIEW_NOTE);
      return;
    }
    if (next !== "revolut" && !stripeKey) return;
    setBusy(true);
    try {
      const res = await fetch("/api/client/ledger/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: next, payerKind: part.kind }),
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
    <div className="space-y-3">
      {parts.map((part) => {
        const company = part.kind === "company";
        const open = openKind === part.kind;
        const society = part.companyName?.trim() || "votre société";
        return (
          <section
            key={part.kind}
            className={
              compact
                ? "space-y-3"
                : `space-y-3 rounded-[1.35rem] p-4 ${
                    company ? "border border-[var(--admin-gold)] bg-white" : "border border-[#e5e3dc] bg-[#f7f6f3]"
                  }`
            }
          >
            {compact ? null : (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                  {part.mention}
                </p>
                {part.amountLabel ? (
                  <p className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">{part.amountLabel}</p>
                ) : null}
              </div>
            )}

            {company && part.payable && !part.canPay ? (
              <p className="text-sm text-muted">Le règlement se fait par {society}.</p>
            ) : null}

            {part.canPay && part.payable && !part.methods.length ? (
              <p className="text-sm text-muted">Le prélèvement et le virement sont ouverts en euros.</p>
            ) : null}

            {part.canPay && part.payable && part.methods.length ? (
              <div className="grid gap-2" role="radiogroup" aria-label={part.mention}>
                {part.methods.map((item) => {
                  const selected = open && method === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => void choose(part, item)}
                      className={`rounded-2xl px-4 py-3 text-left ${
                        selected
                          ? "bg-[var(--admin-navy)] text-white"
                          : compact || company
                            ? "bg-[#f7f6f3] text-[var(--admin-navy)]"
                            : "bg-white text-[var(--admin-navy)]"
                      }`}
                    >
                      <span className="text-sm font-semibold">{STAY_PAY_LABELS[item]}</span>
                      {item !== "revolut" && !stripeKey ? (
                        <span className={`mt-0.5 block text-xs ${selected ? "text-white/75" : "text-muted"}`}>
                          Ce moyen n’est pas encore ouvert.
                        </span>
                      ) : !part.amountLabel ? (
                        <span className={`mt-0.5 block text-xs ${selected ? "text-white/75" : "text-muted"}`}>
                          Rien à régler pour l’instant.
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {open ? <BusyBar active={busy} label="Préparation du règlement…" /> : null}
            {open && paid ? <p className="text-sm text-[var(--admin-navy)]">Ce règlement est déjà enregistré.</p> : null}
            {open && error ? <p className="text-sm text-accent">{error}</p> : null}

            {open && transfer ? (
              <WireInstructions
                iban={transfer.iban}
                bic={transfer.bic}
                accountHolder={transfer.accountHolder}
                reference={transfer.reference}
                partLabel={transfer.partLabel || part.mention}
              />
            ) : null}

            {open && clientSecret && stripeKey && method && method !== "revolut" ? (
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
                {method === "apple_pay" ? <ApplePayForm /> : <CardPayForm sepa={method === "sepa_debit"} />}
              </Elements>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function paymentReturnUrl() {
  return `${window.location.origin}/mon-compte/transactions`;
}

function CardPayForm({ sepa }: { sepa: boolean }) {
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
      confirmParams: { return_url: paymentReturnUrl() },
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

function ApplePayForm() {
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
            confirmParams: { return_url: paymentReturnUrl() },
            redirect: "if_required",
          });
          if (confirmError) {
            event.paymentFailed({ message: confirmError.message });
            setError(confirmError.message || "Apple Pay n’a pas abouti.");
          }
        }}
      />
      {ready === false ? <p className="text-sm text-muted">Apple Pay s’ouvre sur iPhone, iPad ou Safari.</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
