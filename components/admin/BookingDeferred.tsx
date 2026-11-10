"use client";

import { use, useEffect } from "react";
import type { ClientLedgerView } from "@/lib/crm/client-ledger";
import type { CrmBookingItem } from "@/lib/crm/types";

export type DeferredLedgerValue = {
  ledger: ClientLedgerView | null;
  accountLedger: ClientLedgerView | null;
};

/** Le grand livre déjà affiché reste en place. Celui-ci le remplace quand Stripe a répondu. */
export function DeferredLedger({
  promise,
  onReady,
}: {
  promise: Promise<DeferredLedgerValue | null>;
  onReady: (value: DeferredLedgerValue) => void;
}) {
  const value = use(promise);
  useEffect(() => {
    if (value) onReady(value);
  }, [value, onReady]);
  return null;
}

/** Une vague du dossier (e-mails, activité, messages, formalités, Pliant, compta). */
export function DeferredSlice<T>({
  promise,
  onReady,
}: {
  promise: Promise<T | null>;
  onReady: (value: T) => void;
}) {
  const value = use(promise);
  useEffect(() => {
    if (value) onReady(value);
  }, [value, onReady]);
  return null;
}

/** Les étapes déjà là restent. Les contacts et photos d’hôtel arrivent ensuite. */
export function DeferredHotels({
  promise,
  onReady,
}: {
  promise: Promise<CrmBookingItem[] | null>;
  onReady: (items: CrmBookingItem[]) => void;
}) {
  const value = use(promise);
  useEffect(() => {
    if (value) onReady(value);
  }, [value, onReady]);
  return null;
}
