"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/topup", label: "Top Up" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/unsubscribed", label: "Unsubscribed" },
] as const;

export default function MailerAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMailerAuth();
  const pathname = usePathname();

  if (loading) return null;

  if (!user) {
    return (
      <Card className="p-6">
        <div className="font-medium">Not signed in</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Please sign in to access mailer admin.
        </div>
      </Card>
    );
  }

  if (!user.isAdmin) {
    return (
      <Card className="p-6">
        <div className="font-medium">Access denied</div>
        <div className="mt-2 text-sm text-muted-foreground">
          You do not have admin privileges for the mailer.
        </div>
      </Card>
    );
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
