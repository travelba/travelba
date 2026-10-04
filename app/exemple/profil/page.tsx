import { PasswordChangeForm } from "@/components/account/PasswordChangeForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleProfilPage() {
  const session = readExample();

  return (
    <div className="space-y-4">
      <ProfileForm customer={session.customer} documents={session.holderDocuments} />
      <PasswordChangeForm />
    </div>
  );
}
