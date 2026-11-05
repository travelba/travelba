/** Libellé unique de la déconnexion de cet appareil (agence et client). */
export const SIGN_OUT_LABEL = "Se déconnecter";

/** Largeur du menu avatar (`w-64`). */
export const USER_MENU_WIDTH = 256;

const MENU_GAP = 8;
/** Nom, deux liens, Se déconnecter. Sert à le basculer au-dessus si le bas manque. */
const MENU_HEIGHT = 248;

export type MenuAnchor = { top: number; right: number; bottom: number; left: number };

/**
 * Place le menu sous l’avatar, dans la fenêtre.
 * Le résultat est en `fixed` : l’en-tête téléphone a un overflow qui coupait le menu
 * et ne laissait voir que Réglages.
 */
export function userMenuPosition(
  anchor: MenuAnchor,
  viewport: { width: number; height: number },
  align: "left" | "right" = "right",
): { top: number; left: number; width: number } {
  const width = USER_MENU_WIDTH;
  let left = align === "right" ? anchor.right - width : anchor.left;
  const maxLeft = Math.max(MENU_GAP, viewport.width - width - MENU_GAP);
  left = Math.min(Math.max(MENU_GAP, left), maxLeft);
  let top = anchor.bottom + MENU_GAP;
  const above = anchor.top - MENU_GAP - MENU_HEIGHT;
  if (top + MENU_HEIGHT > viewport.height - MENU_GAP && above >= MENU_GAP) top = above;
  return { top, left, width };
}
