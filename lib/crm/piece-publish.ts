/**
 * Vrai seulement au passage Non visible → Visible.
 * Enregistrer le titre, ou renvoyer `visible_to_client` déjà vrai, ne compte pas.
 */
export function stayJustShown(prevVisible: boolean | null | undefined, body: Record<string, unknown>) {
  return (
    Object.prototype.hasOwnProperty.call(body, "visible_to_client") && Boolean(body.visible_to_client) && !prevVisible
  );
}

/**
 * Premier passage en Visible : les cartes encore cachées partent avec le séjour.
 * Un séjour déjà annoncé (message « sejour: ») ne rouvre pas celles cachées à la main.
 */
export function revealKeptHiddenOnShow(justShown: boolean, alreadyAnnounced: boolean) {
  return justShown && !alreadyAnnounced;
}
