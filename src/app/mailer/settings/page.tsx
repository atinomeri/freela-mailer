"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailerLoginPage } from "../login-page";
import { Link } from "@/i18n/navigation";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail?: string | null;
  fromName?: string | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
  hasPassword: boolean;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [host, setHost] = useState("");
  const [port, setPort] = useState(465);
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [source, setSource] = useState<"env" | "user">("user");

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/api/desktop/smtp-config");
        if (!res.ok) throw new Error("Failed to load SMTP config");
        const body = (await res.json()) as { data: SmtpConfig };
        const data = body.data;
        setHost(data.host || "");
        setPort(data.port || 465);
        setSecure(Boolean(data.secure));
        setUsername(data.username || "");
        const parsedFrom = parseFromAddress(data.fromEmail || "");
        setFromEmail(parsedFrom.email);
        setFromName(data.fromName || parsedFrom.name || "");
        setTrackOpens(data.trackOpens ?? true);
        setTrackClicks(data.trackClicks ?? true);
        setSource(data.source);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user, apiFetch]);

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
      const res = await apiFetch("/api/desktop/smtp-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Keep SMTP transport fields unchanged in backend config while this page edits only general defaults.
          host,
          port,
          secure,
          username,
          fromEmail: normalizedFrom.email || null,
          fromName: (fromName || normalizedFrom.name || "").trim() || null,
          trackOpens,
          trackClicks,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(parseError(body, "Failed to save settings"));
      }

      setSource("user");
      setSuccess("General settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">General Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure default sender details and campaign tracking behavior.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
        Email accounts are managed in{" "}
        <Link href="/mailer/smtp-pool" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sending Accounts
        </Link>
        .
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {success}
        </div>
      )}

      <Card className="p-6" hover={false}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <form className="grid gap-8" onSubmit={handleSave}>
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Sender Defaults</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used when a sending account does not define its own sender details.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Default From Email</span>
                  <Input
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="sender@company.com"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Default From Name</span>
                  <Input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Your team or brand name"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-4 border-t border-border/70 pt-6">
              <div>
                <h2 className="text-base font-semibold">Tracking Settings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Controls tracking behavior for all campaigns.
                </p>
              </div>

              <div className="grid gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={trackOpens}
                    onChange={(e) => setTrackOpens(e.target.checked)}
                  />
                  Enable open tracking
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={trackClicks}
                    onChange={(e) => setTrackClicks(e.target.checked)}
                  />
                  Enable click tracking
                </label>
              </div>
            </section>

            <div className="border-t border-border/70 pt-4 text-xs text-muted-foreground">
              Settings source:{" "}
              <span className="font-medium">{source === "user" ? "User config" : "Environment defaults"}</span>
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Save settings
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
