import "server-only";
import fs from "fs";
import path from "path";

/** Lê um documento de docs/ (incluído no deploy por outputFileTracingIncludes no next.config). */
export function readDoc(name: "CHANGELOG.md" | "CHECKLIST-TESTES.md") {
  return fs.readFileSync(path.join(process.cwd(), "docs", name), "utf8");
}
