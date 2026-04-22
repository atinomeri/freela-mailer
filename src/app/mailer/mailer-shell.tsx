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
    <div className="flex min-h-dvh bg-muted/30">
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo area */}
        <div className="flex h-16 items-center justify-between border-b border-border px-6">
          <Link href="/" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
            <Mail className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold">{t("brand")}</span>
          </Link>
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user.isAdmin).map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(key)}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-4">
          <div className="mb-3 truncate text-sm text-muted-foreground">{user.email}</div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t("actions.logOut")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:hidden">
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold">{t("brand")}</span>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
