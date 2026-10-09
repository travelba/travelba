/** Un lien de mot de passe agence part seulement pour un compte déjà dans l’équipe. Jamais de création. */
export function staffResetDecision(input: { userId: string | null; staffId: string | null }) {
  if (!input.userId || !input.staffId) return "silent" as const;
  return "send" as const;
}
