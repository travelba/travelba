import { MfaPanel } from "@/components/admin/MfaPanel";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";

export const metadata = { title: "Sécurité" };

export default async function SecurityPage() {
  await requireStaffPage();
  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Sécurité" subtitle="La double authentification est facultative. Le secret ne quitte pas cet écran." />
      <MfaPanel />
    </div>
  );
}
