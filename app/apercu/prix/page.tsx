import { notFound } from "next/navigation";
import { PricePreview } from "@/components/admin/PricePreview";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aperçu prix", robots: { index: false, follow: false } };

export default function PricePreviewPage() {
  if (!exampleSessionEnabled()) notFound();
  return (
    <main className="admin-af min-h-screen bg-[#F4F1EA] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <PricePreview />
      </div>
    </main>
  );
}
