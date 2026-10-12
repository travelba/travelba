"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/crm/icons";

/** Cadenas posé sur un scan flou, pour qu’on voie que la pièce est illisible à l’écran. */
export function LockBadge({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const icon = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`flex items-center justify-center rounded-full bg-white text-[var(--admin-navy)] shadow-md ring-1 ring-[#C5A880] ${box}`}
    >
      <Icon name="lock" className={icon} />
    </span>
  );
}

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
        <LockBadge />
      </button>
    </div>
  );
}
