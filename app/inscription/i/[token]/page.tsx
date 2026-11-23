import { SignupWizard } from "@/components/inscription/SignupWizard";
import { openSignupInvitation } from "@/lib/crm/signup-run";

export const dynamic = "force-dynamic";

export default async function InvitationSignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await openSignupInvitation(token);
  if (!opened.ok) {
    return (
      <>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Invitation</h1>
        <p className="mt-3 text-sm text-[var(--admin-navy)]">{opened.error}</p>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">Votre invitation</h1>
      <SignupWizard prefill={{ ...opened.prefill, invitationToken: token }} />
    </>
  );
}
