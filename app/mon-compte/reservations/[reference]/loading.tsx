import { AccountPage } from "@/components/account/AccountPage";
import { CrmSkeleton } from "@/components/crm/ui";

export default function Loading() {
  return (
    <AccountPage motion="skeleton">
      <CrmSkeleton rows={5} />
    </AccountPage>
  );
}
