"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { postJson } from "@/lib/crm/client-fetch";
import type { PayerKind } from "@/lib/crm/payer";
import { STAY_PAY_LABELS, type StayPayMethod } from "@/lib/crm/stripe-pay";

const stripeCache = new Map<string, ReturnType<typeof loadStripe>>();

export const PAYMENT_SENT_LABEL = "Règlement transmis, en attente de confirmation bancaire.";

function freshNonce() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Après un règlement : recharge l’encours. Monté seulement à ce moment, donc hors rendu statique. */
function RefreshOnSettle() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}

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
  named = false,
}: {
  parts: ClientPayPart[];
  stripeKey: string | null;
  /** Les montants sont déjà dans l’encours. Ici, seulement le règlement. */
  compact?: boolean;
  /** Deux parts dues : chaque bloc nomme la sienne, pour ne pas confondre les virements. */
  named?: boolean;
}) {
  const [openKind, setOpenKind] = useState<PayerKind | null>(null);
  const [method, setMethod] = useState<StayPayMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferView | null>(null);
  const [paid, setPaid] = useState(false);
  /** Règlement parti chez Stripe : l’encours se recharge, le message attend la banque. */
  const [settled, setSettled] = useState<string | null>(null);
  /** Un nonce par (part, moyen) : rouvrir la même pastille réutilise le même PaymentIntent. */
  const nonce = useRef<{ key: string; value: string } | null>(null);
  const preview = useClientPreview();

  function nonceFor(key: string) {
    if (!nonce.current || nonce.current.key !== key) nonce.current = { key, value: freshNonce() };
    return nonce.current.value;
  }

  async function choose(part: ClientPayPart, next: StayPayMethod) {
    if (busy) return;
    setOpenKind(part.kind);
    setMethod(next);
    setError(null);
    setClientSecret(null);
    setTransfer(null);
    setPaid(false);
    setSettled(null);
    if (!part.canPay || !part.payable || !part.amountLabel) return;
    if (preview) {
      setError(CLIENT_PREVIEW_NOTE);
      return;
    }
    if (next !== "revolut" && !stripeKey) return;
    // Le nonce entre dans la clé d’idempotence côté serveur ; il ne change qu’avec la pastille ou après un règlement.
    const currentNonce = nonceFor(`${part.kind}:${next}`);
    setBusy(true);
    try {
      const result = await postJson<{ alreadyPaid?: boolean; transfer?: TransferView; clientSecret?: string }>(
        "/api/client/ledger/pay",
        { method: next, payerKind: part.kind, nonce: currentNonce }
      );
      const json = result.data || {};
      if (!result.ok) {
        setError(result.error || "Le règlement n’a pas pu démarrer.");
        return;
      }
      if (json.alreadyPaid) {
        nonce.current = null;
        setPaid(true);
        return;
      }
      if (json.transfer) {
        setTransfer(json.transfer);
        return;
      }
      if (typeof json.clientSecret === "string") setClientSecret(json.clientSecret);
      else setError("Le règlement n’a pas pu démarrer.");
    } finally {
      setBusy(false);
    }
  }

  function onPaid(message: string) {
    nonce.current = null;
    setSettled(message);
    setClientSecret(null);
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
              named
                ? "space-y-2 rounded-2xl border border-[#e5e3dc] bg-[#f7f6f3] px-3 py-3"
                : compact
                  ? "space-y-3"
                  : `space-y-3 rounded-[1.35rem] p-4 ${
                      company ? "border border-[var(--admin-gold)] bg-white" : "border border-[#e5e3dc] bg-[#f7f6f3]"
                    }`
            }
          >
            {named ? (
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9c7c4e]">{part.mention}</p>
                  {part.amountLabel ? (
                    <p className="font-display text-base font-extrabold tabular-nums text-[#0B192C]">{part.amountLabel}</p>
                  ) : null}
                </div>
                <p className="text-xs leading-snug text-[#3d4654]">
                  {company
                    ? "Carte, Apple Pay, prélèvement ou virement."
                    : "À régler par carte, Apple Pay ou virement."}
                </p>
              </div>
            ) : compact ? null : (
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
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={part.mention}>
                {part.methods.map((item) => {
                  const selected = open && method === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => void choose(part, item)}
                      className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold ${
                        selected
                          ? "bg-[var(--admin-navy)] text-white"
                          : "border border-[var(--admin-gold)]/55 bg-[#f8f3eb] text-[var(--admin-navy)]"
                      }`}
                    >
                      {STAY_PAY_LABELS[item]}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {open && method && method !== "revolut" && !stripeKey ? (
              <p className="text-xs text-muted">Ce moyen n’est pas encore ouvert.</p>
            ) : null}

            {open ? <BusyBar active={busy} label="Préparation du règlement…" /> : null}
            {open && paid ? <p className="text-sm text-[var(--admin-navy)]">Ce règlement est déjà enregistré.</p> : null}
            {open && settled ? (
              <p className="rounded-xl bg-[#fbf7ec] px-3 py-2 text-sm text-[var(--admin-navy)]" aria-live="polite">
                {settled}
              </p>
            ) : null}
            {open && settled ? <RefreshOnSettle /> : null}
            {open && error ? <p className="text-sm text-accent">{error}</p> : null}

            {open && transfer ? (
              <WireInstructions
                iban={transfer.iban}
                bic={transfer.bic}
                accountHolder={transfer.accountHolder}
                reference={transfer.reference}
                amountLabel={part.amountLabel}
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
                {method === "apple_pay" ? (
                  <ApplePayForm onPaid={onPaid} />
                ) : (
                  <CardPayForm sepa={method === "sepa_debit"} onPaid={onPaid} />
                )}
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

function CardPayForm({ sepa, onPaid }: { sepa: boolean; onPaid: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onPaid(sepa ? "Prélèvement lancé. Il peut prendre quelques jours." : PAYMENT_SENT_LABEL);
      return;
    }
    onPaid(PAYMENT_SENT_LABEL);
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

function ApplePayForm({ onPaid }: { onPaid: (message: string) => void }) {
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
            return;
          }
          onPaid(PAYMENT_SENT_LABEL);
        }}
      />
      {ready === false ? <p className="text-sm text-muted">Apple Pay s’ouvre sur iPhone, iPad ou Safari.</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
