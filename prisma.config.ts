import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: (() => {
      const initialKeys = new Set(Object.keys(process.env));

      const tryLoad = (file: string, overrideExisting: boolean) => {
        const p = path.join(process.cwd(), file);
        if (!fs.existsSync(p)) return;
        const content = fs.readFileSync(p, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx === -1) continue;
          const key = trimmed.slice(0, idx).trim();
          let value = trimmed.slice(idx + 1).trim();
          if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (initialKeys.has(key)) continue;
          if (!overrideExisting && process.env[key]) continue;
          process.env[key] = value;
        }
      };

      tryLoad(".env", false);
      tryLoad(".env.local", true);

      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'Missing DATABASE_URL. Add DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" to .env.local (and optionally .env for Prisma CLI).'
        );
      }
      return url;
    })()
  },
  migrations: {
    path: "prisma/migrations"
  }
});
