"use client";

import { useState } from "react";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

export function MailerLoginPage() {
  const { login } = useMailerAuth();
  const t = useTranslations("mailer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errors.loginFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">{t("brand")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>

        <Card className="p-6" hover={false}>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("login.emailLabel")}</span>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder={t("login.emailPlaceholder")}
                autoComplete="email"
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("login.passwordLabel")}</span>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder={t("login.passwordPlaceholder")}
                autoComplete="current-password"
                required
              />
            </label>

            <Button type="submit" className="mt-2 h-11" loading={pending}>
              {pending ? t("actions.signingIn") : t("actions.signIn")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
