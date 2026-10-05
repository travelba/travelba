import { ProfileHeader } from "@/components/account/ProfileHeader";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";
import { customerFullName } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

export default function ExampleProfilLayout({ children }: { children: React.ReactNode }) {
  const session = readExample();
  return (
    <div className="space-y-4 pb-6">
      <ProfileHeader
        name={customerFullName(session.customer)}
        email={session.customer.email}
        basePath={EXAMPLE_BASE}
      />
      {children}
    </div>
  );
}
