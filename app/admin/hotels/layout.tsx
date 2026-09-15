import { requireStaffPage } from "@/lib/crm/auth";

export default async function HotelsAdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
