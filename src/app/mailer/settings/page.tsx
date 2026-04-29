"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Alert } from "@/components/ui/alert";
import { MailerLoginPage } from "../login-page";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

interface MailerSettings {
  fromEmail?: string | null;
  fromName?: string | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
  source: "env" | "user";
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

function parseFromAddress(raw: string | null | undefined): {
  email: string;
  name: string;
} {
  const value = raw?.trim() || "";
  if (!value) return { email: "", name: "" };

  const angleMatch = value.match(/^(?:"?([^"]*)"?\s*)?<\s*([^<>]+)\s*>$/);
  if (angleMatch) {
    const maybeEmail = angleMatch[2]?.trim() || "";
    const maybeName = angleMatch[1]?.trim() || "";
    if (maybeEmail.includes("@")) {
      return { email: maybeEmail, name: maybeName };
    }
  }

  return { email: value, name: "" };
}

export default function MailerSettingsPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.settingsPage");
  const tA = useTranslations("mailer.actions");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/api/desktop/mailer-settings");
        if (!res.ok) throw new Error(t("loadFailed"));
        const body = (await res.json()) as { data: MailerSettings };
        const data = body.data;
        const parsedFrom = parseFromAddress(data.fromEmail || "");
        setFromEmail(parsedFrom.email);
        setFromName(data.fromName || parsedFrom.name || "");
        setTrackOpens(data.trackOpens ?? true);
        setTrackClicks(data.trackClicks ?? true);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("loadFailed"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user, apiFetch, t]);

  if (!user) return <MailerLoginPage />;

  function parseError(body: ApiErrorShape | null, fallback: string): string {
    const apiErr = body?.error;
    if (typeof apiErr === "string") return apiErr;
    if (typeof apiErr?.message === "string") {
      const details = (apiErr as { details?: Array<{ message?: string }> }).details;
      if (Array.isArray(details) && details.length > 0) {
        const msg = details
          .map((item) => item?.message)
          .filter((item): item is string => typeof item === "string" && item.length > 0)
          .join(", ");
        if (msg) return `${apiErr.message}: ${msg}`;
      }
      return apiErr.message;
    }
    if (typeof body?.message === "string") return body.message;
    return fallback;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const normalizedFrom = parseFromAddress(fromEmail);
      const res = await apiFetch("/api/desktop/mailer-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: normalizedFrom.email || null,
          fromName: (fromName || normalizedFrom.name || "").trim() || null,
          trackOpens,
          trackClicks,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(parseError(body, t("saveFailed")));
      }

      setSuccess(t("saveSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 lg:space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      {error && (
        <Alert variant="destructive" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onDismiss={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {loading ? (
        <SectionCard padded>
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </SectionCard>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Sender defaults */}
          <SectionCard
            title={t("groups.senderDefaults.title")}
            description={t("groups.senderDefaults.description")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">
                  {t("groups.senderDefaults.fromEmailLabel")}
                </span>
                <Input
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder={t("groups.senderDefaults.fromEmailPlaceholder")}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">
                  {t("groups.senderDefaults.fromNameLabel")}
                </span>
                <Input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder={t("groups.senderDefaults.fromNamePlaceholder")}
                />
              </label>
            </div>
          </SectionCard>

          {/* Sending accounts (link out) */}
          <SectionCard
            title={t("groups.sendingAccounts.title")}
            description={t("groups.sendingAccounts.description")}
          >
            <ButtonLink
              href="/smtp-pool"
              variant="secondary"
              size="md"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {t("groups.sendingAccounts.manageAction")}
            </ButtonLink>
          </SectionCard>

          {/* Tracking */}
          <SectionCard
            title={t("groups.tracking.title")}
            description={t("groups.tracking.description")}
          >
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 text-[13.5px] transition-colors hover:border-border">
                <input
                  type="checkbox"
                  checked={trackOpens}
                  onChange={(e) => setTrackOpens(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                />
                <span className="text-foreground">{t("groups.tracking.openLabel")}</span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 text-[13.5px] transition-colors hover:border-border">
                <input
                  type="checkbox"
                  checked={trackClicks}
                  onChange={(e) => setTrackClicks(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                />
                <span className="text-foreground">{t("groups.tracking.clickLabel")}</span>
              </label>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              {saving ? tA("creating") : t("saveAction")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
