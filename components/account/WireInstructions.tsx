import { groupIban } from "@/lib/crm/revolut-wire";

export function WireInstructions({
  iban,
  bic,
  accountHolder,
  reference,
  partLabel,
}: {
  iban: string;
  bic: string;
  accountHolder: string;
  reference: string;
  partLabel?: string | null;
}) {
  return (
    <dl className="space-y-2 rounded-2xl bg-[#f7f6f3] p-4 text-sm text-[var(--admin-navy)]">
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">IBAN</dt>
        <dd className="mt-0.5 font-semibold tracking-wide">{groupIban(iban)}</dd>
      </div>
      {bic ? (
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">BIC</dt>
          <dd className="mt-0.5 font-semibold">{bic}</dd>
        </div>
      ) : null}
      {accountHolder ? (
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Titulaire</dt>
          <dd className="mt-0.5">{accountHolder}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Référence à indiquer</dt>
        <dd className="mt-0.5 font-semibold">{reference}</dd>
      </div>
      <p className="text-xs text-muted">
        {partLabel ? `Cette part : ${partLabel}. ` : ""}
        Indiquez cette référence sur l’ordre de virement. L’agence le rapproche dès réception sur son compte Revolut.
      </p>
    </dl>
  );
}
