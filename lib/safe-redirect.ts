export function safeInternalRedirect(
  value: string | null | undefined,
  allowedRoots: readonly string[],
  fallback: string
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  const pathname = value.split(/[?#]/, 1)[0];
  const allowed = allowedRoots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  );
  return allowed ? value : fallback;
}
