import { FilePreviewGrid } from "@/components/crm/FilePreview";
import type { FilePreviewModel } from "@/lib/crm/preview-files";

export function ReservationFiles({
  passports,
  attachments,
  variant = "client",
}: {
  passports: FilePreviewModel[];
  attachments: FilePreviewModel[];
  variant?: "admin" | "client";
}) {
  const card =
    variant === "admin"
      ? "admin-af-card space-y-3 rounded-3xl p-5"
      : "aura-card space-y-3 rounded-[1.35rem] bg-white p-4";
  return (
    <div className="space-y-4">
      <section className={card}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Passeports des voyageurs
        </p>
        {passports.length ? (
          <FilePreviewGrid files={passports} />
        ) : (
          <p className="text-sm text-muted">Aucun passeport n’est joint pour ces voyageurs.</p>
        )}
      </section>
      <section className={card}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Pièces jointes de la réservation
        </p>
        {attachments.length ? (
          <FilePreviewGrid files={attachments} />
        ) : (
          <p className="text-sm text-muted">Aucune pièce jointe sur cette réservation.</p>
        )}
      </section>
    </div>
  );
}
