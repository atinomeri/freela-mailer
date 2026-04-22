import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ka", "en"],
  defaultLocale: "ka",
  // Keep locale in cookie (no /en prefix) to avoid restructuring App Router with /[locale].
  localePrefix: "never",
  // We handle locale via cookie only (see src/i18n/request.ts).
  localeDetection: false
});
