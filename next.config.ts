import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite compilar numa pasta separada sem atrapalhar o servidor local aberto
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
