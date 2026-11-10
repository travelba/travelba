/**
 * Le premier rendu de la fiche n’attend que `critical`.
 * Le rapprochement Stripe, l’enrichissement hôtel et la réparation des téléchargements partent à côté.
 */
export async function shellAdminBooking<T, R, E>(input: {
  critical: () => Promise<T>;
  reconcile: () => Promise<R>;
  enrich: () => Promise<E>;
  repair: () => Promise<unknown>;
  schedule: (task: () => Promise<unknown>) => void;
}): Promise<{ value: T; reconcile: Promise<R | null>; enrich: Promise<E | null> }> {
  const reconcile = input.reconcile().catch((error: unknown) => {
    console.error("[dossier] prélèvement", error instanceof Error ? error.message : error);
    return null;
  });
  const enrich = input.enrich().catch((error: unknown) => {
    console.error("[dossier] hôtel", error instanceof Error ? error.message : error);
    return null;
  });
  input.schedule(() =>
    input.repair().catch((error: unknown) => {
      console.error("[dossier] téléchargements", error instanceof Error ? error.message : error);
    })
  );
  const value = await input.critical();
  return { value, reconcile, enrich };
}
