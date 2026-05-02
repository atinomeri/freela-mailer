"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function MailerRegisterPage() {
  const { user, register } = useMailerAuth();
  const router = useRouter();
  const t = useTranslations("mailer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [router, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    setPending(true);
    try {
      await register({
        name: name.trim() || undefined,
        email,
        password,
      });
      router.replace("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("already exists")) {
        setError(t("signup.emailExists"));
      } else if (message.toLowerCase().includes("password")) {
        setError(t("signup.passwordTooShort"));
      } else {
        setError(t("signup.failed"));
      }
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
          <h1 className="text-2xl font-semibold">{t("signup.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("signup.subtitle")}</p>
        </div>

        <Card className="p-6" hover={false}>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("signup.nameLabel")}</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                placeholder={t("signup.namePlaceholder")}
                autoComplete="name"
              />
            </label>

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
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("signup.confirmPasswordLabel")}</span>
              <Input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder={t("login.passwordPlaceholder")}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <Button type="submit" className="mt-2 h-11" loading={pending}>
              {pending ? t("signup.creating") : t("signup.createAccount")}
            </Button>
          </form>

          <div className="mt-5 border-t border-border/70 pt-4 text-center text-sm text-muted-foreground">
            <span>{t("signup.haveAccount")}</span>{" "}
            <Link href="/" className="font-semibold text-primary hover:underline">
              {t("actions.signIn")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
