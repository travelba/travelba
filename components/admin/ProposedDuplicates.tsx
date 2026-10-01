"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icons";

const dismissBtn =
  "admin-tap inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-40";

/** Bandeau fermé : le mot et le nombre, sans ouvrir la liste. */
export function proposedDuplicateHeading(count: number) {
  return count > 1 ? `${count} doublons` : "1 doublon";
}

export function ProposedDuplicates({
  duplicates,
  busy = false,
  onDismiss,
}: {
  duplicates: { id: string; label: string }[];
  busy?: boolean;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!duplicates.length) return null;
  const heading = proposedDuplicateHeading(duplicates.length);

  return (
    <details
      className="group mt-2"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen((current) => (current === next ? current : next));
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl bg-[#f4f3f0] px-3 py-3 text-muted [&::-webkit-details-marker]:hidden [&::marker]:content-none">
        <Icon name="mail" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide">{heading}</span>
        <Icon
          name="expand_more"
          className="h-4 w-4 shrink-0 text-[var(--admin-navy)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div>
        {duplicates.map((mail) => (
          <div key={mail.id} className="mt-2 flex items-center gap-3 rounded-2xl bg-[#f4f3f0] px-3 py-3 text-muted">
            <Icon name="mail" className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide">Doublon</span>
              <span className="block truncate">{mail.label}</span>
            </p>
            <button type="button" disabled={busy} className={dismissBtn} onClick={() => onDismiss(mail.id)}>
              Écarter
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
