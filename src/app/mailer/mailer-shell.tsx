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
} from "lucide-react";
import { useState } from "react";
import { PageSpinner } from "@/components/ui/spinner";

const NAV_ITEMS = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/campaigns", key: "nav.campaigns", icon: Mail, adminOnly: false },
  { href: "/contacts", key: "nav.contacts", icon: Users, adminOnly: false },
  { href: "/templates", key: "nav.templates", icon: FileText, adminOnly: false },
  { href: "/reports", key: "nav.reports", icon: History, adminOnly: false },
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh bg-muted/35">
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/70 bg-card/95 shadow-[1px_0_0_hsl(var(--foreground)/0.02)] backdrop-blur transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo area */}
        <div className="flex h-[68px] items-center justify-between border-b border-border/70 px-5">
          <Link href="/" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
              <Mail className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-foreground">{t("brand")}</span>
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
        <nav className="flex-1 space-y-1.5 px-3 py-5">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user.isAdmin).map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium tracking-[-0.005em] transition-all duration-200",
                isActive(href)
                  ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12),0_1px_2px_hsl(var(--foreground)/0.03)]"
                  : "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
              )}
            >
              {isActive(href) && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                  isActive(href)
                    ? "bg-card/85 text-primary"
                    : "text-muted-foreground group-hover:bg-card group-hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2.1} />
              </span>
              <span className="truncate">{t(key)}</span>
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border/70 p-4">
          <div className="mb-3 rounded-xl border border-border/60 bg-muted/35 px-3 py-2.5">
            <div className="truncate text-[12.5px] font-medium text-foreground">{user.email}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{t("brand")}</div>
          </div>
          <button
            onClick={logout}
            className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <LogOut className="h-4 w-4" />
            {t("actions.logOut")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-16 items-center gap-4 border-b border-border/70 bg-card/95 px-4 backdrop-blur lg:hidden">
          <button
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold tracking-tight">{t("brand")}</span>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
