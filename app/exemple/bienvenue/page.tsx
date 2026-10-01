import { ClientOnboarding } from "@/components/account/ClientOnboarding";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";

export default function ExampleWelcomePage() {
  return <ClientOnboarding previewHref={EXAMPLE_BASE} />;
}
