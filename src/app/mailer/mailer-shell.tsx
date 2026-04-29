"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Mail,
  Users,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  FileText,
  Settings,
  History,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import { useState } from "react";
import { PageSpinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageSwitch } from "@/components/ui/language-switch";

const NAV_ITEMS = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/campaigns", key: "nav.campaigns", icon: Mail, adminOnly: false },
  { href: "/contacts", key: "nav.contacts", icon: Users, adminOnly: false },
  { href: "/templates", key: "nav.templates", icon: FileText, adminOnly: false },
  { href: "/reports", key: "nav.reports", icon: History, adminOnly: false },
  { href: "/analytics", key: "nav.analytics", icon: BarChart3, adminOnly: false },
  { href: "/settings", key: "nav.settings", icon: Settings, adminOnly: false },
  { href: "/admin", key: "nav.admin", icon: ShieldCheck, adminOnly: true },
] as const;

export function MailerShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useMailerAuth();
  const pathname = usePathname();
  const t = useTranslations("mailer");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <PageSpinner />
      </div>
    );
  }

  // Not logged in — show children (login page will render)
  if (!user) {
    return <>{children}</>;
  }

  // Focused routes render full-bleed without sidebar/header chrome.
  if (pathname?.startsWith("/templates/editor")) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#F8FAFC] text-slate-900 dark:bg-background dark:text-foreground">
        {children}
      </div>
    );
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh bg-[#F8FAFC] text-slate-900 dark:bg-background dark:text-foreground">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-slate-200 bg-white shadow-[8px_0_28px_-24px_rgba(15,23,42,0.3)] transition-transform duration-200 dark:border-border dark:bg-card lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo area */}
        <div className="flex h-20 items-center justify-between border-b border-slate-200 px-5 dark:border-border">
          <Link href="/" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm dark:bg-primary/10 dark:text-primary">
              <Mail className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-bold tracking-normal text-slate-950 dark:text-foreground">{t("brand")}</span>
          </Link>
          <button
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-5">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user.isAdmin).map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] font-bold tracking-normal transition-all duration-200",
                isActive(href)
                  ? "bg-indigo-50 text-indigo-600 shadow-[inset_0_0_0_1px_rgba(79,70,229,0.08)] dark:bg-primary/10 dark:text-primary"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-950 dark:text-muted-foreground dark:hover:bg-muted/70 dark:hover:text-foreground",
              )}
            >
              {isActive(href) && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-600 dark:bg-primary" />
              )}
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200",
                  isActive(href)
                    ? "text-indigo-600 dark:text-primary"
                    : "text-slate-400 group-hover:text-slate-700 dark:text-muted-foreground dark:group-hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2.1} />
              </span>
              <span className="truncate">{t(key)}</span>
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-slate-200 p-4 dark:border-border">
          <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-border dark:bg-muted/45">
            <div className="flex items-center justify-between">
              <div className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-foreground">{user.email}</div>
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-muted-foreground">{t("brand")}</div>
          </div>
          <div className="mb-3 flex justify-center">
            <LanguageSwitch />
          </div>
          <button
            onClick={logout}
            className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-[13px] font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t("actions.logOut")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden dark:border-border dark:bg-card">
          <div className="flex items-center gap-4">
            <button
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-[15px] font-bold tracking-normal">{t("brand")}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
