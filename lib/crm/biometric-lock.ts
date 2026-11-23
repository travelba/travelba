const LOCK_AFTER_MS = 5 * 60 * 1000;

export type BiometricChoice = "on" | "off" | "";

export function biometricChoiceOf(value: string | null | undefined): BiometricChoice {
  if (value === "on" || value === "off") return value;
  return "";
}

/** Proposé une fois, après la première entrée dans l’espace, si l’appareil sait le faire. */
export function shouldOfferBiometric(choice: BiometricChoice, available: boolean) {
  return available && choice === "";
}

/** Au retour dans l’espace : l’écran attend Face ID ou Touch ID. Le site ne s’en sert pas. */
export function shouldLockWithBiometric(choice: BiometricChoice, hiddenMs: number, path: string) {
  return choice === "on" && hiddenMs >= LOCK_AFTER_MS && path.startsWith("/mon-compte");
}

/** Ouverture de l’application : le mot de passe n’est demandé que si le déverrouillage échoue. */
export function shouldRestoreWithBiometric(choice: BiometricChoice, path: string) {
  if (choice !== "on") return false;
  return path === "/connexion" || path.startsWith("/connexion/") || path.startsWith("/mon-compte");
}
