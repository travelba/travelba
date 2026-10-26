import { createHash } from "node:crypto";
import { dropInboundImage } from "@/lib/crm/email-prefilter";

/** Pièce déjà sur le dossier, reconnue par son empreinte. */
export type StoredPiece = {
  sha256: string | null;
};

export type DepositOutcome = {
  added: number;
  /** Déjà présentes, ou images de signature laissées de côté. */
  skipped: number;
  /** Aucune pièce utile : le mail se classe, le dossier ne reçoit rien. */
  empty: boolean;
};

/** Empreinte du fichier. Sert à ne pas déposer deux fois la même pièce. */
export function attachmentSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Images de signature (image001, logo, fichier image léger) : pas une pièce du dossier.
 * Un PDF, un voucher ou une facture passent.
 */
export function isDepositableAttachment(file: { name: string; mime: string | null; size: number }) {
  return !dropInboundImage({
    filename: file.name,
    mimeType: file.mime,
    size: file.size,
  });
}

export function bookingDocumentKind(name: string, mime: string) {
  const blob = `${mime} ${name}`.toLowerCase();
  if (blob.includes("pdf")) return "pdf";
  if (blob.includes("image") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) return "image";
  return "other";
}

/**
 * Indexes à copier. Une empreinte déjà sur le dossier, ou répétée dans le mail, est sautée.
 * N’écrit aucune carte.
 */
export function planEmailAttachmentCopies(
  incoming: { sha256: string }[],
  existing: StoredPiece[]
) {
  const known = new Set(existing.map((row) => (row.sha256 || "").trim()).filter(Boolean));
  const copy: number[] = [];
  const skipped: number[] = [];
  for (let index = 0; index < incoming.length; index += 1) {
    const hash = incoming[index].sha256.trim();
    if (!hash || known.has(hash)) {
      skipped.push(index);
      continue;
    }
    known.add(hash);
    copy.push(index);
  }
  return { copy, skipped };
}

export function emailDepositMessage(result: DepositOutcome) {
  if (result.added === 0 && result.skipped === 0) {
    return "Aucune pièce jointe à déposer. Le mail est classé sur le dossier, rien n’a été ajouté.";
  }
  if (result.added === 0) {
    return "Ces pièces sont déjà sur le dossier, ou ce ne sont que des images de signature. Le mail est classé. Les cartes n’ont pas changé.";
  }
  const pieces = result.added === 1 ? "Une pièce est déposée" : `${result.added} pièces sont déposées`;
  return `${pieces} sur le dossier. Les cartes n’ont pas changé.`;
}
