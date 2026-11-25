/**
 * Vrai seulement au passage Non visible → Visible.
 * Enregistrer le titre, ou renvoyer `visible_to_client` déjà vrai, ne compte pas.
 */
export function stayJustShown(prevVisible: boolean | null | undefined, body: Record<string, unknown>) {
  return (
    Object.prototype.hasOwnProperty.call(body, "visible_to_client") && Boolean(body.visible_to_client) && !prevVisible
  );
}
