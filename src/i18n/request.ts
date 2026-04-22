import { getRequestConfig } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { cookies } from "next/headers";

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` is set by next-intl middleware (locale prefixes / detection).
  // This app uses cookie-based locale without URL prefixes, so we read `NEXT_LOCALE` directly.
  // (We intentionally avoid Accept-Language auto-detection for stability.)
  const fromMiddleware = await requestLocale;
  const fromCookie = (await cookies()).get("NEXT_LOCALE")?.value;
  const candidate = fromCookie || fromMiddleware;
  const isRoutingLocale = (value: string): value is (typeof routing.locales)[number] =>
    routing.locales.includes(value as (typeof routing.locales)[number]);
  const locale = candidate && isRoutingLocale(candidate) ? candidate : routing.defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages
  };
});
