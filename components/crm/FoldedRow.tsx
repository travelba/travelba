import type { ReactNode } from "react";
import { Icon } from "@/components/crm/icons";

/** Ligne repliée : un seul rang, le détail s’ouvre au clic. */
export function FoldedRow({
  title,
  children,
  className = "aura-card overflow-hidden rounded-[1.35rem] bg-white",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 whitespace-nowrap [&::-webkit-details-marker]:hidden [&::marker]:content-none">
        <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          {title}
        </span>
        <Icon
          name="expand_more"
          className="h-4 w-4 shrink-0 text-[#0B192C] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}
