import { clientVisaStepCopy, clientVisaTrack, type ClientVisaStep } from "@/lib/crm/visa-flow";

export function VisaProgress({ countryName, step }: { countryName: string; step: ClientVisaStep }) {
  const track = clientVisaTrack(step);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">{countryName}</p>
      <ol className="space-y-1 text-sm">
        {track.map((row) => (
          <li key={row.id} className={row.state === "à venir" ? "text-muted" : "text-[var(--admin-navy)]"}>
            <span className={row.state === "en cours" ? "font-semibold" : ""}>{row.label}</span>
            {row.state === "en cours" ? " — en cours" : row.state === "fait" ? " — fait" : ""}
          </li>
        ))}
      </ol>
      <p className="text-sm text-[var(--admin-navy)]">{clientVisaStepCopy(step)}</p>
    </div>
  );
}
