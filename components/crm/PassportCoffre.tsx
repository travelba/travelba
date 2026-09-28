import Link from "next/link";
import type { PassportVaultRow } from "@/lib/crm/passport-vault";

export function PassportCoffre({
  rows,
  hrefFor,
  embedded = false,
}: {
  rows: PassportVaultRow[];
  hrefFor: (row: PassportVaultRow) => string | null;
  /** Dans un bloc déjà cadré, sans seconde carte. */
  embedded?: boolean;
}) {
  if (!rows.length) return null;
  const body = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Coffre</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const href = row.tone === "ok" ? null : hrefFor(row);
          const tone =
            row.tone === "ok"
              ? "bg-[#0B192C] text-[#C5A880]"
              : row.tone === "soon"
                ? "bg-[#C5A880]/25 text-[#0B192C]"
                : "bg-[#f3e6e2] text-[#0B192C]";
          return (
            <li key={row.travelerId} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-[#0B192C]">{row.name}</span>
              {href ? (
                <Link href={href} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                  {row.label}
                </Link>
              ) : (
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                  {row.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
  if (embedded) return <div>{body}</div>;
  return <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">{body}</section>;
}
