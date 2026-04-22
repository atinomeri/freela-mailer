import { MailerAuthProvider } from "@/lib/mailer-auth";
import { MailerShell } from "./mailer/mailer-shell";
import MailerDashboard from "./mailer/page";

export default function RootPage() {
  return (
    <MailerAuthProvider>
      <MailerShell>
        <MailerDashboard />
      </MailerShell>
    </MailerAuthProvider>
  );
}
