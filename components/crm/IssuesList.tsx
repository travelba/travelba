import type { BookingIssue } from "@/lib/crm/booking-issues";

export function IssuesList({
  issues,
  className = "",
}: {
  issues: BookingIssue[];
  className?: string;
}) {
  if (!issues.length) return null;
  return (
    <div
      className={`rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)] ${className}`}
      role="alert"
    >
      {issues.length === 1 ? (
        <p>{issues[0].message}</p>
      ) : (
        <>
          <p className="font-semibold">{issues.length} points empêchent l’enregistrement</p>
          <ul className="mt-1 list-disc pl-4">
            {issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
