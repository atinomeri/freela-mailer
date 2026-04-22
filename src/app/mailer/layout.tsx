import { MailerAuthProvider } from "@/lib/mailer-auth";
import { MailerShell } from "./mailer-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Mailer", template: "%s | Mailer" },
  description: "Email campaign management",
};

export default function MailerLayout({ children }: { children: React.ReactNode }) {
  return (
    <MailerAuthProvider>
      <MailerShell>{children}</MailerShell>
    </MailerAuthProvider>
  );
}
