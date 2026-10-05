import { ProfileSubnav } from "@/components/account/ProfileSubnav";

/** En-tête commun de Mon compte : titre = libellé du menu, fiche (nom, e-mail) puis la sous-nav. */
export function ProfileHeader({
  name,
  email,
  basePath = "/mon-compte",
}: {
  name: string;
  email: string | null | undefined;
  basePath?: string;
}) {
  return (
    <>
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
        <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Mon compte</h1>
        <p className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">{name}</p>
        {email ? <p className="truncate text-sm text-muted">{email}</p> : null}
      </section>
      <ProfileSubnav basePath={basePath} />
    </>
  );
}
