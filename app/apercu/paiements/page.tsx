import { notFound } from "next/navigation";
import { PaymentPreview } from "@/app/apercu/paiements/preview";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aperçu paiements", robots: { index: false, follow: false } };

export default function PaymentPreviewPage() {
  if (!exampleSessionEnabled()) notFound();
  return (
    <main className="admin-af min-h-screen bg-[#F4F1EA] px-4 py-8">
      <PaymentPreview />
    </main>
  );
}
