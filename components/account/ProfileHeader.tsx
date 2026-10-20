import Link from "next/link";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { ONBOARDING_REPLAY_LABEL } from "@/lib/crm/onboarding";
import { onboardingReplayHref } from "@/lib/crm/session";

/** En-tête commun de Mon compte : titre = libellé du menu, fiche (nom, e-mail) puis la sous-nav. */
export function ProfileHeader({
  name,
  email,
  basePath = "/mon-compte",
  replayHref = onboardingReplayHref(basePath),
}: {
  name: string;
  email: string | null | undefined;
  basePath?: string;
  replayHref?: string;
}) {
  return (
    <>
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
        <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Mon compte</h1>
        <p className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">{name}</p>
        {email ? <p className="truncate text-sm text-muted">{email}</p> : null}
        <Link
          href={replayHref}
          className="mt-3 inline-flex text-sm font-semibold text-[#9e7e51] underline-offset-2 hover:underline"
        >
          {ONBOARDING_REPLAY_LABEL}
        </Link>
      </section>
      <ProfileSubnav basePath={basePath} />
    </>
  );
}
