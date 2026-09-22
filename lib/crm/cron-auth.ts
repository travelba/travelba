export function cronAuthorized(
  authorizationHeader: string | null | undefined,
  secret: string | null | undefined
) {
  const expected = secret?.trim();
  if (!expected) return false;
  return (authorizationHeader || "") === `Bearer ${expected}`;
}
