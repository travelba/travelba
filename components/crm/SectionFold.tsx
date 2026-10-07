"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function SectionFold({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#e5e3dc] py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--admin-navy)]">{title}</span>
          {open ? null : <span className="block truncate text-xs text-muted">{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="mt-3 grid gap-4">{children}</div> : null}
    </div>
  );
}
