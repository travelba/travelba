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
  // Native / heavy Node modules must not be bundled by Turbopack
  serverExternalPackages: [
    "@napi-rs/canvas",
    "sharp",
    "tesseract.js",
    "pdfjs-dist",
    "unpdf",
    "mrz",
  ],
};

export default withNextIntl(nextConfig);
