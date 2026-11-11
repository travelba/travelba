import type { ReactNode } from "react";
import { FilePreviewGrid } from "@/components/crm/FilePreview";
import type { FilePreviewModel } from "@/lib/crm/preview-files";

export function ReservationFiles({
  passports = [],
  attachments,
  variant = "client",
  showPassports = true,
  attachmentsLabel = "Pièces jointes de la réservation",
  emptyLabel = "Aucune pièce jointe sur cette réservation.",
  onRemoveAttachment,
  removeQuestion,
  leading = null,
  trailing = null,
}: {
  passports?: FilePreviewModel[];
  attachments: FilePreviewModel[];
  variant?: "admin" | "client";
  showPassports?: boolean;
  attachmentsLabel?: string;
  emptyLabel?: string;
  onRemoveAttachment?: (file: FilePreviewModel) => void | string | null | undefined | Promise<void | string | null | undefined>;
  removeQuestion?: string | ((file: FilePreviewModel) => string);
  /** Cartes d’embarquement, au-dessus des autres pièces. */
  leading?: ReactNode;
  /** Complément après les pièces, si un écran en a encore besoin. */
  trailing?: ReactNode;
}) {
  const card =
    variant === "admin"
      ? "admin-af-card space-y-3 rounded-3xl p-5"
      : "aura-card space-y-3 rounded-[1.35rem] bg-white p-4";
  return (
    <div className="space-y-4">
      {showPassports ? (
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
      ) : null}
      <section className={card}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          {attachmentsLabel}
        </p>
        {leading}
        {attachments.length ? (
          <div className={leading ? "pt-1" : undefined}>
            <FilePreviewGrid files={attachments} onRemove={onRemoveAttachment} removeQuestion={removeQuestion} />
          </div>
        ) : leading || trailing ? null : (
          <p className="text-sm text-muted">{emptyLabel}</p>
        )}
        {trailing}
      </section>
    </div>
  );
}
