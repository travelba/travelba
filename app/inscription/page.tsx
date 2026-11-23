import { SignupWizard } from "@/components/inscription/SignupWizard";
import { extractReferralCode } from "@/lib/crm/signup";

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ parrain?: string }>;
}) {
  const params = await searchParams;
  const referralCode = params.parrain ? extractReferralCode(params.parrain) || params.parrain : "";
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">Demander mon inscription</h1>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
        L’agence relit chaque demande. L’accès à l’espace s’ouvre seulement après validation.
      </p>
      <SignupWizard prefill={{ referralCode }} />
    </>
  );
}
