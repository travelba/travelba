"use client";

import { FilePreviewTile } from "@/components/crm/FilePreview";
import {
  BOARDING_LEG_LABEL,
  type BoardingPassGrouping,
} from "@/lib/crm/boarding-pass-groups";
import type { BoardingShownPass, FilePreviewModel } from "@/lib/crm/preview-files";

type RemoveResult = void | string | null | undefined;

function rowFile(pass: BoardingShownPass): FilePreviewModel {
  if (pass.preview) return pass.preview;
  return {
    id: pass.id,
    path: "",
    href: pass.href || pass.walletHref,
    walletHref: pass.walletHref,
    fileName: pass.href ? "Carte embarquement.pdf" : "passe.pkpass",
    mimeType: pass.href ? "application/pdf" : "application/vnd.apple.pkpass",
    label: pass.label,
    shareText: "",
  };
}

function PassLines({
  passes,
  onRemove,
  removeQuestion,
}: {
  passes: BoardingShownPass[];
  onRemove?: (file: FilePreviewModel) => RemoveResult | Promise<RemoveResult>;
  removeQuestion?: string | ((file: FilePreviewModel) => string);
}) {
  if (!passes.length) return null;
  return (
    <ul className="space-y-2">
      {passes.map((pass) => {
        const file = rowFile(pass);
        return (
          <li key={pass.id}>
            <FilePreviewTile
              file={file}
              onRemove={onRemove ? () => onRemove(file) : undefined}
              removeQuestion={typeof removeQuestion === "function" ? removeQuestion(file) : removeQuestion}
            />
          </li>
        );
      })}
    </ul>
  );
}

function FileLinks({ files }: { files: { id: string; href: string; label: string }[] }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-col items-start gap-1 px-1">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#5c6570] underline decoration-[#c5c6cd] underline-offset-2"
        >
          {file.label}
        </a>
      ))}
    </div>
  );
}

function FlightGroup({
  group,
  onRemove,
  removeQuestion,
}: {
  group: BoardingPassGrouping<BoardingShownPass>["upcoming"][number];
  onRemove?: (file: FilePreviewModel) => RemoveResult | Promise<RemoveResult>;
  removeQuestion?: string | ((file: FilePreviewModel) => string);
}) {
  const title = [group.airline, group.number].filter(Boolean).join(" · ");
  const meta = [group.route, group.when].filter(Boolean).join(" · ");
  const heading = title || meta || "Vol";
  const sub = title ? meta : "";
  return (
    <section className="space-y-2" data-flight={group.id}>
      <div className="flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">{heading}</p>
          {sub ? <p className="truncate text-xs text-muted">{sub}</p> : null}
        </div>
        {group.role ? (
          <span className="shrink-0 rounded-full bg-[#C5A880]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-navy)]">
            {BOARDING_LEG_LABEL[group.role]}
          </span>
        ) : null}
      </div>
      <PassLines passes={group.passes} onRemove={onRemove} removeQuestion={removeQuestion} />
      <FileLinks files={group.files} />
    </section>
  );
}

export function boardingGroupsEmpty(groups: BoardingPassGrouping<BoardingShownPass> | null | undefined) {
  if (!groups) return true;
  return !groups.upcoming.length && !groups.past.length && !groups.other;
}

/**
 * Cartes d’embarquement par vol. Les vols déjà posés se replient.
 * `foldPast` faux : le vol demandé reste ouvert, même s’il a atterri.
 */
export function BoardingPassGroups({
  groups,
  foldPast = true,
  onRemove,
  removeQuestion,
}: {
  groups: BoardingPassGrouping<BoardingShownPass>;
  foldPast?: boolean;
  onRemove?: (file: FilePreviewModel) => RemoveResult | Promise<RemoveResult>;
  removeQuestion?: string | ((file: FilePreviewModel) => string);
}) {
  if (boardingGroupsEmpty(groups)) return null;
  const fold = foldPast && groups.past.length > 0 && groups.upcoming.length > 0;
  const pastOpen = groups.past.length > 0 && !groups.upcoming.length;
  return (
    <div className="space-y-4">
      {groups.upcoming.map((group) => (
        <FlightGroup key={group.id} group={group} onRemove={onRemove} removeQuestion={removeQuestion} />
      ))}
      {fold ? (
        <details className="space-y-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden">
            <span>Vols passés</span>
            <span className="text-xs font-semibold text-muted">{groups.past.length}</span>
          </summary>
          <div className="space-y-4 pt-1">
            {groups.past.map((group) => (
              <FlightGroup key={group.id} group={group} onRemove={onRemove} removeQuestion={removeQuestion} />
            ))}
          </div>
        </details>
      ) : pastOpen && foldPast ? (
        <details open className="space-y-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden">
            <span>Vols passés</span>
            <span className="text-xs font-semibold text-muted">{groups.past.length}</span>
          </summary>
          <div className="space-y-4 pt-1">
            {groups.past.map((group) => (
              <FlightGroup key={group.id} group={group} onRemove={onRemove} removeQuestion={removeQuestion} />
            ))}
          </div>
        </details>
      ) : (
        groups.past.map((group) => (
          <FlightGroup key={group.id} group={group} onRemove={onRemove} removeQuestion={removeQuestion} />
        ))
      )}
      {groups.other ? (
        <section className="space-y-2">
          <p className="px-0.5 text-sm font-semibold text-[var(--admin-navy)]">Autres cartes d’embarquement</p>
          <PassLines passes={groups.other.passes} onRemove={onRemove} removeQuestion={removeQuestion} />
          <FileLinks files={groups.other.files} />
        </section>
      ) : null}
    </div>
  );
}
