import {
  boardingSegments,
  documentFlightId,
  groupBoardingPasses,
  type BoardingPassGrouping,
  type BoardingSegment,
  type BoardingTravelerName,
} from "./boarding-pass-groups";
import { documentLabel } from "./carnet";
import { clientBoardingHref, type BoardingFileLink, type ClientBoardingCard } from "./client-boarding-pass";
import { isBoardingPassDocument } from "./online-checkin";
import { isPlaceholderTraveler, type PersonName } from "./person-match";
import { documentMatchesTraveler, travelerDisplayName } from "./trip-documents";
import type { CrmBookingDocument, CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "./types";

export type FilePreviewModel = {
  id: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  label: string;
  shareText: string;
  /** Code /v/CODE : la pièce se lit sans session, toujours via /api/files. */
  partage?: string | null;
  /** Pièce d’identité : vignette et aperçu restent flous. Le fichier téléchargé est net. */
  sealed?: boolean;
  /**
   * Ouverture directe. Posé pour une carte d’embarquement cachée :
   * le fichier ne passe pas par /api/files, qui ne sert que les pièces publiées.
   */
  href?: string | null;
  /** Passe Apple Wallet du même voyageur. */
  walletHref?: string | null;
};

export function isPreviewImage(mime?: string | null, name?: string | null) {
  const hay = `${mime || ""} ${name || ""}`.toLowerCase();
  return hay.includes("image") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name || "");
}

export function isPreviewPdf(mime?: string | null, name?: string | null) {
  const hay = `${mime || ""} ${name || ""}`.toLowerCase();
  return hay.includes("pdf") || /\.pdf$/i.test(name || "");
}

function passportShareText(reference?: string | null) {
  const ref = (reference || "").trim();
  return ref
    ? `Bonjour, je vous transmets un passeport du dossier ${ref}.`
    : "Bonjour, je vous transmets un passeport pour ce séjour.";
}

function attachmentShareText(reference?: string | null) {
  const ref = (reference || "").trim();
  return ref
    ? `Bonjour, je vous transmets une pièce du dossier ${ref}.`
    : "Bonjour, je vous transmets une pièce de la réservation.";
}

/** Un passeport avec fichier par voyageur. Le texte de partage ne contient pas le numéro. */
export function passportPreviewsForStay(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  holder?: PersonName | null,
  reference?: string | null
): FilePreviewModel[] {
  const named = travelers.filter(
    (traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name)
  );
  const party = named.length ? named : travelers;
  const out: FilePreviewModel[] = [];
  const seen = new Set<string>();
  for (const traveler of party) {
    const matches = docs.filter(
      (doc) =>
        doc.doc_type === "passport" &&
        Boolean(doc.storage_path) &&
        documentMatchesTraveler(doc, traveler, holder)
    );
    const doc =
      matches.find((row) => row.booking_id === traveler.booking_id) || matches[0] || null;
    if (!doc?.storage_path || seen.has(doc.storage_path)) continue;
    seen.add(doc.storage_path);
    out.push({
      id: doc.id,
      path: doc.storage_path,
      fileName: doc.file_name || "passeport",
      mimeType: doc.mime_type,
      label: travelerDisplayName(traveler),
      shareText: passportShareText(reference),
      sealed: true,
    });
  }
  return out;
}

export function attachmentPreviews(
  docs: CrmBookingDocument[],
  items: CrmBookingItem[],
  reference?: string | null
): FilePreviewModel[] {
  return docs
    .filter((doc) => Boolean(doc.storage_path))
    .map((doc) => ({
      id: doc.id,
      path: doc.storage_path,
      fileName: doc.file_name || "document",
      mimeType: doc.mime_type,
      label: documentLabel(doc, items),
      shareText: attachmentShareText(reference),
    }));
}

function boardingShareText(reference?: string | null) {
  const ref = (reference || "").trim();
  return ref
    ? `Bonjour, je vous transmets une carte d’embarquement du dossier ${ref}.`
    : "Bonjour, je vous transmets une carte d’embarquement.";
}

function boardingLabel(card: ClientBoardingCard) {
  const who = card.firstName || "Carte d’embarquement";
  const seat = card.seat ? `siège ${card.seat}` : "";
  return [who, seat || card.flight].filter(Boolean).join(" · ");
}

/** Nom et siège seulement : le vol est dans l’en-tête du groupe. */
export function boardingRowLabel(card: Pick<ClientBoardingCard, "firstName" | "seat">) {
  const who = card.firstName || "Carte d’embarquement";
  return card.seat ? `${who} · siège ${card.seat}` : who;
}

export function boardingPassFile(card: ClientBoardingCard, reference?: string | null): FilePreviewModel | null {
  const href = card.walletOnly ? null : card.href || clientBoardingHref(card.documentId, card.page);
  const walletHref = card.walletHref || null;
  if (!href && !walletHref) return null;
  return {
    id: card.key,
    path: "",
    href: href || walletHref,
    walletHref,
    fileName: card.walletOnly ? "passe.pkpass" : "Carte embarquement.pdf",
    mimeType: card.walletOnly ? "application/vnd.apple.pkpass" : "application/pdf",
    label: boardingRowLabel(card),
    shareText: boardingShareText(reference),
  };
}

/** Une vignette par passager, puis le PDF entier quand il regroupe plusieurs pages. */
export function boardingPassPreviews(
  cards: ClientBoardingCard[],
  full: BoardingFileLink[],
  reference?: string | null
): FilePreviewModel[] {
  const people = cards.flatMap((card) => {
    const file = boardingPassFile(card, reference);
    if (!file) return [];
    return [{ ...file, label: boardingLabel(card) }];
  });
  const files = full.flatMap((file) => {
    if (!file.href) return [];
    return [
      {
        id: `complet:${file.documentId}`,
        path: "",
        href: file.href,
        fileName: "Cartes embarquement.pdf",
        mimeType: "application/pdf",
        label: file.label,
        shareText: boardingShareText(reference),
      },
    ];
  });
  return [...people, ...files];
}

export type BoardingShownPass = {
  id: string;
  label: string;
  href: string | null;
  walletHref: string | null;
  preview?: FilePreviewModel;
};

type GroupablePass = {
  id: string;
  itemId: string | null;
  firstName: string;
  lastName?: string | null;
  card?: ClientBoardingCard;
  preview?: FilePreviewModel;
};

function shownPass(pass: GroupablePass, reference?: string | null): BoardingShownPass | null {
  if (pass.preview) {
    return {
      id: pass.preview.id,
      label: pass.preview.label,
      href: pass.preview.href || null,
      walletHref: pass.preview.walletHref || null,
      preview: pass.preview,
    };
  }
  if (!pass.card) return null;
  const file = boardingPassFile(pass.card, reference);
  if (!file) return null;
  return {
    id: file.id,
    label: file.label,
    href: file.href || null,
    walletHref: file.walletHref || null,
    preview: file,
  };
}

function shownGroups(
  grouping: BoardingPassGrouping<GroupablePass>,
  reference?: string | null
): BoardingPassGrouping<BoardingShownPass> {
  const mapGroup = (group: BoardingPassGrouping<GroupablePass>["upcoming"][number]) => ({
    ...group,
    passes: group.passes.flatMap((pass) => {
      const shown = shownPass(pass, reference);
      return shown ? [shown] : [];
    }),
  });
  return {
    upcoming: grouping.upcoming.map(mapGroup).filter((group) => group.passes.length || group.files.length),
    past: grouping.past.map(mapGroup).filter((group) => group.passes.length || group.files.length),
    other: grouping.other
      ? {
          passes: grouping.other.passes.flatMap((pass) => {
            const shown = shownPass(pass, reference);
            return shown ? [shown] : [];
          }),
          files: grouping.other.files,
        }
      : null,
  };
}

/** Cartes déjà lues, rangées par vol. Le PDF complet n’est pas une ligne voyageur. */
export function groupedBoardingPasses(input: {
  cards: ClientBoardingCard[];
  full: BoardingFileLink[];
  segments: BoardingSegment[];
  travelers?: BoardingTravelerName[];
  reference?: string | null;
  now?: Date;
  extras?: GroupablePass[];
}) {
  const grouping = groupBoardingPasses({
    segments: input.segments,
    passes: [
      ...input.cards.map((card) => ({
        id: card.key,
        itemId: card.itemId,
        firstName: card.firstName,
        lastName: card.lastName,
        card,
      })),
      ...(input.extras || []),
    ],
    files: input.full.map((file) => ({
      id: `complet:${file.documentId}`,
      href: file.href,
      label: file.label,
      itemIds: file.itemIds,
    })),
    travelers: input.travelers,
    now: input.now,
  });
  const shown = shownGroups(grouping, input.reference);
  if (shown.other && !shown.other.passes.length && !shown.other.files.length) shown.other = null;
  return shown;
}

/** Pièces du dossier admin : cartes d’embarquement par vol, le reste à part. */
export function splitBoardingAttachments(
  docs: CrmBookingDocument[],
  items: CrmBookingItem[],
  travelers: { first_name?: string | null; last_name?: string | null }[],
  reference?: string | null,
  now?: Date
) {
  const segments = boardingSegments(items, { clientVisible: false });
  const boarding = docs.filter((doc) => isBoardingPassDocument(doc) && doc.storage_path);
  const others = attachmentPreviews(
    docs.filter((doc) => !isBoardingPassDocument(doc)),
    items,
    reference
  );
  const groups = groupedBoardingPasses({
    cards: [],
    full: [],
    segments,
    travelers: travelers.map((traveler) => ({
      firstName: traveler.first_name || "",
      lastName: traveler.last_name || "",
    })),
    reference,
    now,
    extras: boarding.flatMap((doc) => {
      const preview = attachmentPreviews([doc], items, reference)[0];
      if (!preview) return [];
      const extracted = doc.extracted;
      const firstName =
        extracted && typeof extracted === "object" && typeof extracted.firstName === "string" ? extracted.firstName : "";
      const lastName =
        extracted && typeof extracted === "object" && typeof extracted.lastName === "string" ? extracted.lastName : "";
      return [
        {
          id: doc.id,
          itemId: documentFlightId(doc, segments),
          firstName,
          lastName,
          preview,
        },
      ];
    }),
  });
  return { groups, others };
}

export function identityPreview(
  doc: Pick<CrmTravelDocument, "id" | "storage_path" | "file_name" | "mime_type" | "doc_type">,
  label: string
): FilePreviewModel | null {
  if (!doc.storage_path) return null;
  const passport = doc.doc_type === "passport";
  return {
    id: doc.id,
    path: doc.storage_path,
    fileName: doc.file_name || (passport ? "passeport" : "piece"),
    mimeType: doc.mime_type,
    label: label.trim() || (passport ? "Passeport" : "Pièce"),
    shareText: passport
      ? "Bonjour, je vous transmets un passeport."
      : "Bonjour, je vous transmets une pièce d’identité.",
    sealed: true,
  };
}
