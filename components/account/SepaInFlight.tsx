import { sepaBannerLine, type SepaFailureView, type SepaHoldView } from "@/lib/crm/sepa-hold";

/** Bannière prélèvement : en cours, ou refusé avec la marche à suivre. Jamais l’IBAN complet. */
export function SepaInFlight({
  holds,
  failures = [],
  tone = "client",
}: {
  holds: SepaHoldView[];
  failures?: SepaFailureView[];
  tone?: "client" | "admin";
}) {
  if (!holds.length && !failures.length) return null;
  return (
    <div className="space-y-3">
      {holds.map((hold) => (
        <section
          key={hold.paymentIntentId || hold.launchedAt}
          className="rounded-xl border border-[#e5d3b3] bg-[#fbf7ec] px-4 py-3"
          role="status"
        >
          <p className="text-[13px] font-semibold text-[var(--admin-navy)]">Prélèvement SEPA en cours</p>
          <p className="mt-1 text-sm leading-snug text-[var(--admin-navy)]">{sepaBannerLine(hold)}</p>
          {tone === "admin" ? (
            <p className="mt-2 text-xs leading-snug text-[#3d4654]">
              Ce n’est pas une somme déjà encaissée, et ce n’est pas un impayé à relancer. Le crédit sera
              compté quand la banque aura confirmé.
              {hold.paymentIntentId ? ` Référence Stripe ${hold.paymentIntentId}.` : ""}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-snug text-[#3d4654]">
              Vous n’avez rien d’autre à faire pour ce montant. Il ne sera marqué payé qu’à la confirmation
              de la banque.
            </p>
          )}
        </section>
      ))}
      {failures.map((failure) => (
        <section
          key={failure.paymentIntentId || failure.at}
          className="rounded-xl border border-[#e7c8c4] bg-[#fdf6f5] px-4 py-3"
          role="alert"
        >
          <p className="text-[13px] font-semibold text-[var(--admin-navy)]">Prélèvement SEPA refusé</p>
          <p className="mt-1 text-sm leading-snug text-[var(--admin-navy)]">{failure.message}</p>
          {tone === "admin" && failure.paymentIntentId ? (
            <p className="mt-2 text-xs leading-snug text-[#3d4654]">Référence Stripe {failure.paymentIntentId}.</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
