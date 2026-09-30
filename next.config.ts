import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { CHROMIUM_TRACE_INCLUDES } from "./lib/crm/chromium-pack";

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
  outputFileTracingIncludes: CHROMIUM_TRACE_INCLUDES,
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
