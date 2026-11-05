export function StayConfirmedNote({
  reference,
  confirmation,
  summary,
  price,
  calendarHref,
  manageHref,
}: {
  reference?: string;
  confirmation?: string | null;
  summary?: string;
  price?: string;
  calendarHref?: string;
  manageHref?: string;
} = {}) {
  if (!summary && !calendarHref) {
    return (
      <p className="rounded-2xl bg-[#0B192C] px-4 py-3 text-sm leading-relaxed text-[#f7f4ee]" data-stay-confirmed="1">
        Votre réservation est confirmée.
      </p>
    );
  }
  const number = (confirmation || "").trim() || reference || "";
  return (
    <section className="space-y-3 rounded-2xl bg-[#0B192C] px-4 py-4 text-sm leading-relaxed text-[#f7f4ee]" data-stay-confirmed="1">
      <p className="font-semibold">Votre réservation est confirmée.</p>
      {number ? <p>Numéro {number}</p> : null}
      {summary ? <p>{summary}</p> : null}
      {price ? <p>{price} TTC</p> : null}
      <div className="flex flex-col gap-2 pt-1">
        {calendarHref ? (
          <a href={calendarHref} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#C5A880] font-semibold text-[#0B192C]">
            Ajouter au calendrier
          </a>
        ) : null}
        {manageHref ? (
          <a href={manageHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-[#f7f4ee]/30 font-semibold">
            Gérer la réservation
          </a>
        ) : null}
      </div>
    </section>
  );
}
