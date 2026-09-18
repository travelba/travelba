import { redirect } from "next/navigation";

export default function PaiementRedirectPage() {
  redirect("/mon-compte/profil/facturation");
}
