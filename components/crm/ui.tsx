import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function BrandMark({
  href = "/",
  subtitle,
}: {
  href?: string;
  subtitle?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--admin-navy)] font-display text-[11px] font-extrabold tracking-wider text-white shadow-sm">
        TBA
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">
          {siteConfig.shortName}
        </span>
        {subtitle ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function PageEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--aura-blue)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--aura-blue)]" />
      {children}
    </p>
  );
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)] sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusChip({
  tone = "sky",
  children,
}: {
  tone?: "sky" | "green" | "amber" | "red" | "navy";
  children: React.ReactNode;
}) {
  const tones = {
    sky: "bg-[var(--admin-sky)] text-[var(--admin-navy)] border-transparent",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-[var(--admin-red)] border-red-200",
    navy: "bg-[var(--admin-navy)] text-white border-transparent",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ConciergeBanner() {
  return (
    <aside className="admin-af-card flex flex-col gap-4 overflow-hidden rounded-[1.35rem] bg-[var(--admin-navy)] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--aura-blue)] text-lg font-bold">
          M
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--aura-blue-soft)]">
            Conciergerie 24/7
          </p>
          <h3 className="mt-1 font-display text-lg font-bold">
            Votre majordome voyage dédié
          </h3>
          <p className="mt-1 text-sm text-white/70">
            Modifications urgentes, transferts ou questions sur votre dossier.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/${siteConfig.whatsappNumber}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
        >
          WhatsApp
        </a>
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="inline-flex items-center rounded-full bg-[var(--aura-blue)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Contacter
        </a>
      </div>
    </aside>
  );
}

export function bookingStatusTone(
  status: string
): "sky" | "green" | "amber" | "red" | "navy" {
  switch (status) {
    case "confirmed":
    case "travelling":
    case "completed":
      return "green";
    case "quoted":
    case "draft":
      return "amber";
    case "cancelled":
      return "red";
    default:
      return "sky";
  }
}
