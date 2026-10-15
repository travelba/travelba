export function ReviewDoubtList({
  rows,
}: {
  rows: { key: string; label: string; reasons: string[] }[];
}) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1 text-sm text-accent" role="status">
      <p className="font-semibold">Lecture douteuse</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="font-semibold">{row.label}</span>
            {" — "}
            {row.reasons.join(" ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
