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

/** Fichiers publics versionnés (vidéo du hero, badge). Le HTML Next reste en revalidation. */
const IMMUTABLE_ASSET = "public, max-age=31536000, immutable";

const ICON_SOURCES = [
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon.png",
  "/favicon-16.png",
  "/favicon-32.png",
  "/favicon-48.png",
  "/manifest.webmanifest",
];

export function staticCacheHeaders() {
  return [
    { source: "/videos/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET }] },
    { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET }] },
    ...ICON_SOURCES.map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET }],
    })),
  ];
}
