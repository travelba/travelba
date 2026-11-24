import { SignupWizard } from "@/components/inscription/SignupWizard";
import { expiresLabel } from "@/lib/crm/signup";
import { openSignupInvitation } from "@/lib/crm/signup-run";

export const dynamic = "force-dynamic";

export default async function InvitationSignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await openSignupInvitation(token);
  if (!opened.ok) {
    return (
      <div className="invite-letter">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8A7349]">Sur invitation</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-[#0B192C]">Invitation</h1>
        <p className="mt-3 text-sm text-[#0B192C]">{opened.error}</p>
      </div>
    );
  }
  const until = Date.parse(opened.expiresAt);
  return (
    <SignupWizard
      prefill={{ ...opened.prefill, invitationToken: token }}
      linkUntil={Number.isFinite(until) ? expiresLabel(new Date(until)) : null}
    />
  );
}
