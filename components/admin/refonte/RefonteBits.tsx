import Link from "next/link";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { WeekDot } from "@/lib/crm/refonte-preview";

export function InertButton({
  children,
  tone = "navy",
}: {
  children: React.ReactNode;
  tone?: "navy" | "accent" | "ghost";
}) {
  const toneClass =
    tone === "accent"
      ? "admin-af-btn-accent"
      : tone === "ghost"
        ? "border border-[var(--border)] bg-white text-[var(--admin-navy)]"
        : "admin-af-btn";
  return (
    <button
      type="button"
      aria-disabled="true"
      title="Aperçu : ce geste n’écrit rien"
      className={`${toneClass} inline-flex shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm`}
    >
      {children}
    </button>
  );
}

const DOT: Record<WeekDot, string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-[var(--admin-red)]",
};

export function Dot({ tone, label }: { tone: WeekDot; label?: string }) {
  return <span aria-label={label} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />;
}

export function dayHead(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function euro(amount: number | null, currency = "EUR") {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return formatMoney(amount, currency);
}

export function SectionTitle({ id, title, aside }: { id: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 id={id} className="font-display text-lg font-bold text-[var(--admin-navy)]">
        {title}
      </h2>
      {aside}
    </div>
  );
}

export function StayLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="min-w-0 flex-1">
      <span className="block truncate font-semibold text-[var(--admin-navy)]">{title}</span>
      <span className="mt-0.5 block truncate text-sm text-muted">{detail}</span>
    </Link>
  );
}

export { formatDateFr };
