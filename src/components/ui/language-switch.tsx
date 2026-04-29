"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];

const COOKIE_NAME = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  try {
    window.localStorage.setItem("freela-mailer-locale", locale);
  } catch {
    // localStorage may be unavailable (private mode, quota); cookie is the source of truth.
  }
}

export function LanguageSwitch({ className }: { className?: string }) {
  const active = useLocale() as Locale;
  const t = useTranslations("mailer.languageSwitch");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === active || pending) return;
    setLocaleCookie(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-xl border border-border/70 bg-card p-0.5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
        pending && "opacity-70",
        className,
      )}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => pick(locale)}
            aria-pressed={isActive}
            disabled={pending}
            className={cn(
              "h-8 min-w-[34px] rounded-lg px-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
              isActive
                ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-600 dark:bg-primary dark:text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}
