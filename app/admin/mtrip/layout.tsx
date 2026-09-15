import { requireStaffPage } from "@/lib/crm/auth";

export default async function MtripAdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage("mtrip");
  return children;
}
