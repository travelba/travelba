import Link from "next/link";
import { contactPath, PREVIEW } from "@/lib/vitrine/paths";
import { CLUB_NOTE } from "@/lib/vitrine/destinations";

export function AppRecall({ children }: { children: string }) {
  return (
    <aside className="vz-recall">
      <p>{children}</p>
      <Link className="vz-link" href={`${PREVIEW}/application`}>
        L’application
      </Link>
    </aside>
  );
}

export function Ask({
  slug,
  title,
  anchor,
}: {
  slug: string;
  title: string;
  anchor?: string;
}) {
  const extra = { voyage: slug, titre: title, ...(anchor ? { ancre: anchor } : {}) };
  return (
    <div className="vz-ask">
      <Link className="vz-link" href={contactPath("itineraire", extra)}>
        Demander cet itinéraire
      </Link>
      <Link className="vz-link" href={contactPath("personnaliser", extra)}>
        Le personnaliser
      </Link>
    </div>
  );
}

export function ClubNote() {
  return <p className="vz-club-note">{CLUB_NOTE}</p>;
}

export function CtaRow({ href, label, second }: { href: string; label: string; second?: { href: string; label: string } }) {
  return (
    <div className="vz-actions">
      <Link className="vz-link" href={href}>
        {label}
      </Link>
      {second ? (
        <Link className="vz-link" href={second.href}>
          {second.label}
        </Link>
      ) : null}
    </div>
  );
}
