import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  serverExternalPackages: ["sharp", "unpdf", "@napi-rs/canvas", "pdfjs-dist", "puppeteer-core", "@sparticuz/chromium"],
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
