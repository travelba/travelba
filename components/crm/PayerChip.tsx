import { bookingPayerLabel, type BookingPayerKind } from "@/lib/crm/company-role";

export function PayerChip({
  kind,
  companyName,
  voice = "client",
}: {
  kind: BookingPayerKind;
  companyName?: string | null;
  voice?: "client" | "admin";
}) {
  const company = kind === "company";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        company
          ? "border-[var(--admin-gold)]/40 bg-[var(--admin-gold)]/15 text-[#7a6344]"
          : "border-[#e5e3dc] bg-[#efeeeb] text-[var(--admin-navy)]"
      }`}
    >
      {bookingPayerLabel(kind, companyName, { voice })}
    </span>
  );
}
