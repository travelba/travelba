import { foldLetters } from "./text";
import { sortItemsByOrder } from "./carnet";
import { nextStayLabels } from "./staff-stay";
import { isEmailBodyFile } from "./ingest-title";
import { QUOTE_CAVEAT_NOTE, tagSourceFileName, type IngestFamily } from "./ingest-parse";
import {
  emptyBookingExtract,
  joinAgencyNotes,
  sanitizeExtractedPrices,
  type BookingExtract,
  type IngestWarning,
} from "./ingest-types";
import { mergeExtractItems } from "./item-match";
import { QUOTE_REVIEW_REASON } from "./review-doubt";
import { completeFlightRoutes } from "./flight-route";

export type FileExtractResult = {
  name: string;
  family: IngestFamily;
  extract: BookingExtract;
  identity?: boolean;
  error?: string;
  warning?: string;
};

export function dedupeTravelers(
  travelers: BookingExtract["travelers"]
): BookingExtract["travelers"] {
  const out: BookingExtract["travelers"] = [];
  const seen = new Set<string>();
  for (const traveler of travelers || []) {
    const first = (traveler.first_name || "").trim();
    const last = (traveler.last_name || "").trim();
    if (!first && !last) continue;
    const key = `${foldLetters(first)}|${foldLetters(last)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ first_name: first || null, last_name: last || null });
  }
  return out;
}

function markQuoteItems(items: BookingExtract["items"], sourceNames: Set<string>) {
  return items.map((item) => {
    const source = item.details?.source_file_name || "";
    if (!sourceNames.has(source)) return item;
    return {
      ...item,
      details: {
        ...(item.details || {}),
        needs_review: true,
        review_reason: item.details?.review_reason || QUOTE_REVIEW_REASON,
      },
    };
  });
}

function pickDate(
  values: Array<string | null | undefined>,
  mode: "min" | "max"
): string | null {
  const dates = values
    .map((value) => (value || "").slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  if (!dates.length) return null;
  return mode === "min" ? dates[0] : dates[dates.length - 1];
}

export function mergeFileExtracts(results: FileExtractResult[]): {
  extract: BookingExtract;
  warnings: IngestWarning[];
} {
  const warnings: IngestWarning[] = [];
  const failed = results.filter((row) => row.error);
  const identity = results.filter((row) => row.identity && !row.error);
  const bookingRows = results.filter((row) => !row.error && !row.identity);

  for (const row of failed) {
    warnings.push({
      file: row.name,
      message: row.error || "Lecture impossible",
    });
  }
  for (const row of identity) {
    warnings.push({
      file: row.name,
      message: "Pièce d’identité — à classer dans le profil, pas en réservation.",
    });
  }
  for (const row of bookingRows) {
    if (row.warning) warnings.push({ file: row.name, message: row.warning });
  }

  if (!bookingRows.length) {
    const extract = emptyBookingExtract();
    if (identity.length && !failed.length) extract.document_status = "identity";
    return { extract, warnings };
  }

  const quoteNames = new Set(
    bookingRows
      .filter(
        (row) => row.family === "quote" || row.extract.document_status === "quote"
      )
      .map((row) => row.name)
  );
  const hasQuote = quoteNames.size > 0;
  const hasCancelled = bookingRows.some((row) => row.extract.document_status === "cancelled");
  const hasConfirmed = bookingRows.some(
    (row) =>
      row.family !== "quote" &&
      row.extract.document_status !== "quote" &&
      row.extract.document_status !== "cancelled"
  );

  let items: BookingExtract["items"] = [];
  const travelers: BookingExtract["travelers"] = [];
  const notes: string[] = [];
  let title = "";
  let destination = "";
  let email = "";
  let firstName = "";
  let lastName = "";

  for (const row of bookingRows) {
    const tagged = {
      ...row.extract,
      items: tagSourceFileName(row.extract.items || [], row.name),
    };
    items = mergeExtractItems([...items, ...tagged.items]);
    travelers.push(...(tagged.travelers || []));
    if (tagged.notes_internal) notes.push(tagged.notes_internal);
    if (tagged.notes_client) notes.push(tagged.notes_client);
    if (!title && tagged.title && !isEmailBodyFile(row.name)) title = tagged.title;
    if (!destination && tagged.destination) destination = tagged.destination;
    if (!email && tagged.customer_email) email = tagged.customer_email;
    if (!firstName && tagged.customer_first_name) {
      firstName = tagged.customer_first_name;
    }
    if (!lastName && tagged.customer_last_name) lastName = tagged.customer_last_name;
  }

  if (hasQuote && hasConfirmed) {
    items = markQuoteItems(items, quoteNames);
    notes.push(
      "Le lot mélange un devis et des confirmations : les cartes devis restent à vérifier."
    );
  } else if (hasQuote) {
    notes.push(QUOTE_CAVEAT_NOTE);
  }

  const merged: BookingExtract = {
    ...emptyBookingExtract(),
    document_status: hasCancelled
      ? "cancelled"
      : hasQuote && !hasConfirmed
        ? "quote"
        : "confirmed",
    title,
    destination,
    currency: "EUR",
    customer_email: email,
    customer_first_name: firstName,
    customer_last_name: lastName,
    notes_client: null,
    notes_internal: joinAgencyNotes(...notes),
    items: sortItemsByOrder(items),
    travelers: dedupeTravelers(travelers),
  };

  const labels = nextStayLabels(merged.title, merged.destination, merged.items, "");
  if (labels.title) merged.title = labels.title;
  if (labels.destinationChanged && labels.destination) merged.destination = labels.destination;
  else if (!merged.destination && labels.suggestedDestination) merged.destination = labels.suggestedDestination;
  if (!merged.title || !merged.destination) {
    const stays = labels.plan.destinations.length ? labels.plan.destinations : labels.suggestedDestination.split(" · ").filter(Boolean);
    const line = stays.join(" · ");
    if (!merged.title && line) merged.title = line;
    if (!merged.destination && line) merged.destination = line;
  }
  merged.start_date = pickDate(
    [merged.start_date, ...merged.items.map((item) => item.start_at)],
    "min"
  );
  merged.end_date = pickDate(
    [merged.end_date, ...merged.items.map((item) => item.end_at || item.start_at)],
    "max"
  );
  merged.items = completeFlightRoutes(merged.items);

  return { extract: sanitizeExtractedPrices(merged), warnings };
}
