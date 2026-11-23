import Link from "next/link";
import { INVITE_ONLY_MESSAGE } from "@/lib/crm/signup";

export default function InscriptionPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">Travel Club TBA</h1>
      <p className="text-sm leading-relaxed text-[var(--admin-navy)]">{INVITE_ONLY_MESSAGE}</p>
      <Link href="/connexion" className="inline-flex text-sm font-semibold underline">
        Se connecter
      </Link>
    </div>
  );
}
