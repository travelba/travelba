/**
 * En-têtes de sécurité posés par `next.config.ts` (B-31).
 * `X-Frame-Options: SAMEORIGIN`, pas DENY : `FilePreview` encadre `/api/files?…&inline=1`
 * dans un <iframe> du même site (aperçus PDF admin et client). Un site tiers ne peut
 * toujours pas encadrer la moindre page. Pas de CSP ici : Stripe, Supabase et Unsplash
 * exigeraient un test dédié.
 */
export const FRAME_ANCESTORS_HEADER = { key: "X-Frame-Options", value: "SAMEORIGIN" } as const;

export function securityHeaders() {
  return [
    {
      source: "/:path*",
      headers: [
        FRAME_ANCESTORS_HEADER,
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ];
}
