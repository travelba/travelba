"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/crm/icons";

/** Passeport visible, illisible : le cadenas ouvre la pièce. */
export function PassportSeal({
  children,
  onOpen,
  label = "Afficher le passeport",
  className = "",
}: {
  children: ReactNode;
  onOpen: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      <div className="pointer-events-none select-none blur-md" aria-hidden="true">
        {children}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 flex items-center justify-center"
        aria-label={label}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--admin-navy)] shadow-md ring-1 ring-[#C5A880]">
          <Icon name="lock" className="h-5 w-5" />
        </span>
      </button>
    </div>
  );
}
