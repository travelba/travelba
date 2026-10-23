import { HotelAccessCard } from "@/components/admin/HotelAccessCard";

export default function HotelAccessPreviewPage() {
  return (
    <div className="space-y-4 bg-[#f6f1e8] p-4">
      <HotelAccessCard
        customerId="aperçu"
        enabled={false}
        demo={false}
        live={false}
        pendingAt="2026-10-23T09:30:00.000Z"
        admin
        preview
      />
    </div>
  );
}
