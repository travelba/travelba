"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import { brandMarkForItem } from "@/lib/crm/brand-marks";
import { kindIcon } from "@/lib/crm/carnet";

export function BrandMark({
  item,
  className = "h-10 w-10",
}: {
  item: {
    kind?: string | null;
    supplier?: string | null;
    title?: string | null;
    details?: Record<string, unknown> | null;
  };
  className?: string;
}) {
  const mark = brandMarkForItem(item);
  const [broken, setBroken] = useState(false);
  if (!mark || broken) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)] ${className}`}>
        <Icon name={kindIcon(item.kind || "")} className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-[#e5e3dc] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- logos IATA / SVG locaux */}
      <img
        src={mark.src}
        alt={mark.alt}
        className="h-full w-full object-contain p-1"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </span>
  );
}
