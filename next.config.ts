import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Le dev server n’accepte le websocket HMR que depuis localhost. 127.0.0.1 est l’origine du navigateur local.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  serverExternalPackages: ["sharp", "unpdf", "@napi-rs/canvas", "pdfjs-dist", "puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/admin/bookings/[id]/eta-il": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/client/bookings/[id]/visa": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/cron/visa-portal": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "www.travelba.fr" }],
        destination: "https://travelba.fr/",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.travelba.fr" }],
        destination: "https://travelba.fr/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
