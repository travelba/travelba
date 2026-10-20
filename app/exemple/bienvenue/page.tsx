import { ClientOnboarding } from "@/components/account/ClientOnboarding";
import { OnboardingShell } from "@/components/account/OnboardingShell";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";

export default function ExampleWelcomePage() {
  return (
    <OnboardingShell>
      <ClientOnboarding previewHref={EXAMPLE_BASE} />
    </OnboardingShell>
  );
}
