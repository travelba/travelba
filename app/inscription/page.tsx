import Link from "next/link";
import { INVITE_ONLY_MESSAGE } from "@/lib/crm/signup";

export default function InscriptionPage() {
  return (
    <div className="space-y-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8A7349]">Cercle privé</p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#0B192C]">Travel Club TBA</h1>
      <p className="text-sm leading-relaxed text-[#0B192C]">{INVITE_ONLY_MESSAGE}</p>
      <Link
        href="/connexion"
        className="inline-flex rounded-full bg-[#0B192C] px-5 py-3 text-sm font-bold text-[#C5A880]"
      >
        Se connecter
      </Link>
    </div>
  );
}
