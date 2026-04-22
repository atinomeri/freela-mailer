"use client";

import { Card } from "@/components/ui/card";
import { useMailerAuth } from "@/lib/mailer-auth";

export default function MailerAdminOverviewPage() {
  const { user } = useMailerAuth();
  if (!user) return null;

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Mailer Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>. Use the
        links above to manage desktop user balances, view payments, and administer the
        cross-tenant unsubscribe list.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        These tools are scoped to the mailer product and do not depend on the freela.ge admin
        session.
      </p>
    </Card>
  );
}
