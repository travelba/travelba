import { AccountPage } from "@/components/account/AccountPage";
import { BiometricUnlock } from "@/components/account/BiometricUnlock";
import { PasswordChangeForm } from "@/components/account/PasswordChangeForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PushPreferences } from "@/components/account/PushPreferences";
import { readExample } from "@/lib/crm/example-store";

const PREVIEW_PREFS = {
  available: true,
  extended: true,
  messages: true,
  push_travel: true,
  push_documents: true,
  push_payment: true,
  push_messages: true,
  push_checkin: true,
  push_flight_change: true,
  push_departure: true,
  push_balance: false,
};

export const dynamic = "force-dynamic";

export default function ExampleProfilPage() {
  const session = readExample();

  return (
    <AccountPage motion="fade">
    <div className="space-y-4">
      <ProfileForm customer={session.customer} documents={session.holderDocuments} />
      <BiometricUnlock preview />
      <PushPreferences preview={PREVIEW_PREFS} />
      <PasswordChangeForm />
    </div>
    </AccountPage>
  );
}
