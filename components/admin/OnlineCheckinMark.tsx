import type { FlightCheckinView } from "@/lib/crm/online-checkin";

export function onlineCheckinBadgeClass(line: Pick<FlightCheckinView, "alert" | "done" | "status">) {
  if (line.alert) return "bg-[#C5A880]/30 text-[#0B192C]";
  if (line.done) return "bg-white text-[#0B192C] ring-1 ring-[#d9d1c3]";
  if (line.status === "en_cours") return "bg-[#0B192C] text-white";
  return "bg-white text-[#3d4654] ring-1 ring-[#d9d1c3]";
}

export function OnlineCheckinBadge({ line }: { line: FlightCheckinView }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${onlineCheckinBadgeClass(line)}`}
    >
      {line.label}
    </span>
  );
}
