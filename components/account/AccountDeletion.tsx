"use client";

import { useState } from "react";
import { AccountDeletedNotice } from "@/components/account/AccountDeletedNotice";
import { ConfirmDialog } from "@/components/crm/ConfirmDialog";
import { signOutAccount } from "@/lib/crm/account-sign-out";
import {
  ACCOUNT_DELETED_PATH,
  ACCOUNT_DELETION_CANCEL,
  ACCOUNT_DELETION_CONFIRM,
  ACCOUNT_DELETION_LEAD,
  ACCOUNT_DELETION_PARAGRAPHS,
  ACCOUNT_DELETION_TITLE,
} from "@/lib/crm/account-deletion-copy";

/** Suppression immédiate du compte. Le dialogue dit ce qui part et ce que la loi garde. */
export function AccountDeletion() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function confirmDeletion() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/client/account/deletion", {
      method: "POST",
      credentials: "same-origin",
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setBusy(false);
      setError(body?.error || "La suppression n’a pas pu être terminée. Réessayez.");
      return;
    }
    setDone(true);
    setOpen(false);
    await signOutAccount("global", ACCOUNT_DELETED_PATH);
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center bg-[#faf9f6] px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[480px]">
          <AccountDeletedNotice />
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#e3e2e0]/70 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--admin-navy)]">{ACCOUNT_DELETION_TITLE}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {ACCOUNT_DELETION_LEAD}{" "}
        <a className="font-semibold text-[var(--admin-navy)] underline" href="https://travelba.fr/fr/confidentialite">
          Politique de confidentialité
        </a>
      </p>
      <div className="mt-3">
        <button
          type="button"
          className="admin-tap inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/40"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          {ACCOUNT_DELETION_TITLE}
        </button>
      </div>
      <ConfirmDialog
        open={open}
        title={ACCOUNT_DELETION_TITLE}
        question={ACCOUNT_DELETION_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        confirmLabel={ACCOUNT_DELETION_CONFIRM}
        cancelLabel={ACCOUNT_DELETION_CANCEL}
        tone="danger"
        busy={busy}
        busyLabel="Suppression…"
        error={error}
        onConfirm={() => {
          void confirmDeletion();
        }}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      />
    </section>
  );
}
