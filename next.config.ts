import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite compilar numa pasta separada sem atrapalhar o servidor local aberto
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Documentos lidos pelas páginas do Super Admin (Changelog e Checklist de testes)
  outputFileTracingIncludes: {
    "/admin/changelog": ["./docs/CHANGELOG.md"],
    "/admin/testes": ["./docs/CHECKLIST-TESTES.md"],
  },
};

export default nextConfig;
