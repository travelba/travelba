export function TripPhone({
  title,
  lines,
}: {
  title: string;
  lines: readonly (readonly [string, string])[];
}) {
  return (
    <div className="tba-phone is-still" aria-hidden="true">
      <div className="tba-phone-notch" />
      <p className="tba-phone-kicker">Dans l’application</p>
      <h3>{title}</h3>
      <ul>
        {lines.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
      <p>Exemple. Le vrai carnet est celui du dossier.</p>
    </div>
  );
}
