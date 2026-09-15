import { requireStaffPage } from "@/lib/crm/auth";

export default async function DossiersAdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage("mtrip");
  return children;
}
