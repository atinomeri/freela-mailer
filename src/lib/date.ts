const KA_MONTHS = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი"
] as const;

const KA_LOCALE_24H = "ka-GE-u-hc-h23";
const GEORGIA_TIMEZONE = "Asia/Tbilisi";

function toValidDate(input: Date | string | number): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatGeorgianLongDate(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return "";

  const day = date.getDate();
  const month = KA_MONTHS[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

export function formatLongDate(input: Date | string | number, locale: string): string {
  if (locale === "ka" || locale.startsWith("ka-")) return formatGeorgianLongDate(input);

  const date = toValidDate(input);
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }
}

export function formatGeorgianDate(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return "";
  return new Intl.DateTimeFormat(KA_LOCALE_24H, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: GEORGIA_TIMEZONE,
  }).format(date);
}

export function formatGeorgianTime(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return "";
  return new Intl.DateTimeFormat(KA_LOCALE_24H, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: GEORGIA_TIMEZONE,
  }).format(date);
}

export function formatGeorgianDateTime(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return "";
  return new Intl.DateTimeFormat(KA_LOCALE_24H, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: GEORGIA_TIMEZONE,
  }).format(date);
}
