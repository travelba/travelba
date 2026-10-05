import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Le dépôt parent a son propre lockfile. Sans cette racine, Next compile le proxy Travelba.
  turbopack: {
    root: path.join(process.cwd()),
  },
};

export default nextConfig;
