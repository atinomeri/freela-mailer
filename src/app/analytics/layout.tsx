import { MailerAuthProvider } from "@/lib/mailer-auth";
import { MailerShell } from "../mailer/mailer-shell";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <MailerAuthProvider>
      <MailerShell>{children}</MailerShell>
    </MailerAuthProvider>
  );
}
