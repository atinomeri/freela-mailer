"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { PageSpinner } from "@/components/ui/spinner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/topup", label: "Top Up" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/unsubscribed", label: "Unsubscribed" },
] as const;

export default function MailerAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, apiFetch } = useMailerAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAuthorized(false);

    async function verifyAccess() {
      if (loading) return;

      if (!user) {
        router.replace("/");
        return;
      }

      try {
        const res = await apiFetch("/api/desktop/account/me");
        if (!res.ok) {
          router.replace("/");
          return;
        }

        const body = (await res.json()) as { isAdmin?: boolean };
        if (!body.isAdmin) {
          router.replace("/");
          return;
        }

        if (!cancelled) {
          setAuthorized(true);
        }
      } catch {
        router.replace("/");
      }
    }

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [loading, user, apiFetch, router]);

  if (loading || !authorized || !user) {
    return <PageSpinner />;
  }

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        {ADMIN_NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md border px-3 py-1.5 transition-colors",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
