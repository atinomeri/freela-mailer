"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { MailerLoginPage } from "../../login-page";
import { useTranslations } from "next-intl";

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

interface TemplateOption {
  id: string;
  name: string;
  category: string;
  subject: string;
  html: string;
}

interface ContactListOption {
  id: string;
  name: string;
  contactCount: number;
}

interface PreflightResult {
  status: "good" | "warning" | "critical";
  recommendations: string[];
  checkedAt: string;
}

const STEPS = [
  "Details",
  "Audience",
  "Content",
  "Preflight",
  "Send",
] as const;

const HOURS_24 = Array.from({ length: 24 }, (_, idx) => String(idx).padStart(2, "0"));
const MINUTES_60 = Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, "0"));

function parseTimeParts(value: string): { hour: string; minute: string } {
  const [hourRaw, minuteRaw] = value.split(":", 2);
  const hour = HOURS_24.includes(hourRaw) ? hourRaw : "00";
  const minute = MINUTES_60.includes(minuteRaw) ? minuteRaw : "00";
  return { hour, minute };
}

function buildHHmm(hour: string, minute: string): string {
  const safeHour = HOURS_24.includes(hour) ? hour : "00";
  const safeMinute = MINUTES_60.includes(minute) ? minute : "00";
  return `${safeHour}:${safeMinute}`;
}

function localDateAndTimeToIso(datePart: string, timePart: string): string | null {
  const date = datePart.trim();
  const time = timePart.trim();
  if (!date || !time) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const tbilisiOffsetHours = 4;
  const utcMs = Date.UTC(year, month - 1, day, hour - tbilisiOffsetHours, minute, 0, 0);
  const parsed = new Date(utcMs);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function TimeSelect24({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { hour, minute } = parseTimeParts(value);

  return (
    <div className="flex items-center gap-2">
      <select
        value={hour}
        onChange={(e) => onChange(buildHHmm(e.target.value, minute))}
        className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
      >
        {HOURS_24.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted-foreground">:</span>
      <select
        value={minute}
        onChange={(e) => onChange(buildHHmm(hour, e.target.value))}
        className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
      >
        {MINUTES_60.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function NewCampaignPage() {
  const { user, apiFetch } = useMailerAuth();
  const router = useRouter();
  const t = useTranslations("mailer");

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  const [contactLists, setContactLists] = useState<ContactListOption[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [html, setHtml] = useState("");

  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightKey, setPreflightKey] = useState("");

  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [confirmReady, setConfirmReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const [templatesRes, listsRes] = await Promise.all([
          apiFetch("/api/desktop/templates"),
          apiFetch("/api/desktop/contact-lists?page=1&limit=200"),
        ]);
        if (templatesRes.ok) {
          const templatesBody = await templatesRes.json();
          setTemplates(templatesBody.data ?? []);
        }
        if (listsRes.ok) {
          const listsBody = await listsRes.json();
          setContactLists(listsBody.data ?? []);
        }
      } catch {
        // keep empty state
      }
    }
    void loadData();
  }, [user, apiFetch]);

  const selectedLists = useMemo(
    () => contactLists.filter((list) => selectedListIds.includes(list.id)),
    [contactLists, selectedListIds],
  );

  const recipientsCount = useMemo(
    () => selectedLists.reduce((acc, list) => acc + Number(list.contactCount ?? 0), 0),
    [selectedLists],
  );

  const detailsValid = useMemo(
    () => name.trim().length > 0 && senderEmail.includes("@"),
    [name, senderEmail],
  );
  const audienceValid = useMemo(
    () => selectedListIds.length > 0 && recipientsCount > 0,
    [selectedListIds, recipientsCount],
  );
  const contentValid = useMemo(
    () => subject.trim().length > 0 && html.trim().length > 0,
    [subject, html],
  );

  const preflightFingerprint = useMemo(
    () =>
      JSON.stringify({
        senderEmail: senderEmail.trim().toLowerCase(),
        subject: subject.trim(),
        previewText: previewText.trim(),
        html: html.trim(),
        recipientsCount,
      }),
    [senderEmail, subject, previewText, html, recipientsCount],
  );

  const canGoNext = (currentStep: number): boolean => {
    if (currentStep === 1) return detailsValid;
    if (currentStep === 2) return audienceValid;
    if (currentStep === 3) return contentValid;
    if (currentStep === 4) return Boolean(preflight) && !preflightLoading;
    return true;
  };

  async function runPreflight(force = false) {
    if (!detailsValid || !audienceValid || !contentValid) return;
    if (!force && preflightKey === preflightFingerprint && preflight) return;

    setPreflightLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/desktop/campaigns/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail,
          subject,
          previewText,
          html,
          recipientsCount,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        const apiError = body?.error;
        const message =
          typeof apiError === "string"
            ? apiError
            : typeof apiError?.message === "string"
              ? apiError.message
              : typeof body?.message === "string"
                ? body.message
                : "Failed to run preflight";
        throw new Error(message);
      }
      const body = (await res.json()) as { data: PreflightResult };
      setPreflight(body.data);
      setPreflightKey(preflightFingerprint);
    } catch (err) {
      setPreflight(null);
      setError(err instanceof Error ? err.message : "Failed to run preflight");
    } finally {
      setPreflightLoading(false);
    }
  }

  useEffect(() => {
    if (step !== 4) return;
    void runPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, preflightFingerprint]);

  if (!user) return <MailerLoginPage />;

  async function resolveAudienceListId(): Promise<string> {
    if (selectedListIds.length === 1) return selectedListIds[0];

    const res = await apiFetch("/api/desktop/contact-lists/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listIds: selectedListIds,
        name: `${name.trim()} Audience`,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
      const apiError = body?.error;
      const message =
        typeof apiError === "string"
          ? apiError
          : typeof apiError?.message === "string"
            ? apiError.message
            : typeof body?.message === "string"
              ? body.message
              : "Failed to prepare audience";
      throw new Error(message);
    }
    const body = (await res.json()) as { data: { id: string } };
    return body.data.id;
  }

  async function handleFinish() {
    setError("");
    if (!detailsValid || !audienceValid || !contentValid) {
      setError("Complete all required steps before sending.");
      return;
    }
    if (!preflight || preflightLoading || preflightKey !== preflightFingerprint) {
      setError("Run preflight check before sending.");
      return;
    }
    if (!confirmReady) {
      setError("Please confirm the campaign is ready to send.");
      return;
    }

    const scheduledAtIso =
      sendMode === "schedule"
        ? localDateAndTimeToIso(scheduledDate, scheduledTime)
        : null;

    if (sendMode === "schedule" && !scheduledAtIso) {
      setError(t("errors.invalidScheduleDateTime"));
      return;
    }

    setSaving(true);
    try {
      const audienceListId = await resolveAudienceListId();

      const createRes = await apiFetch("/api/desktop/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          previewText: previewText.trim() || undefined,
          senderName: senderName.trim() || undefined,
          senderEmail: senderEmail.trim() || undefined,
          html: html.trim(),
          contactListId: audienceListId,
          scheduleMode: "ONCE",
          scheduledAt: sendMode === "schedule" ? scheduledAtIso || undefined : undefined,
          preflight: {
            status: preflight.status.toUpperCase(),
            recommendations: preflight.recommendations,
            checkedAt: preflight.checkedAt,
          },
        }),
      });

      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => null)) as ApiErrorShape | null;
        const apiError = body?.error;
        const message =
          typeof apiError === "string"
            ? apiError
            : typeof apiError?.message === "string"
              ? apiError.message
              : typeof body?.message === "string"
                ? body.message
                : t("errors.createCampaignFailed");
        throw new Error(message);
      }

      const createdBody = await createRes.json();
      const campaignId = createdBody.data?.id as string;

      if (sendMode === "now") {
        const sendRes = await apiFetch(`/api/desktop/campaigns/${campaignId}/send`, {
          method: "POST",
        });
        if (!sendRes.ok) {
          const body = (await sendRes.json().catch(() => null)) as ApiErrorShape | null;
          const apiError = body?.error;
          const message =
            typeof apiError === "string"
              ? apiError
              : typeof apiError?.message === "string"
                ? apiError.message
                : typeof body?.message === "string"
                  ? body.message
                  : t("errors.sendCampaignFailed");
          throw new Error(message);
        }
      }

      router.push(`/mailer/campaigns/${campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish campaign");
    } finally {
      setSaving(false);
    }
  }

  function statusBadge(status: PreflightResult["status"]) {
    if (status === "good") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          good
        </span>
      );
    }
    if (status === "warning") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
        <ShieldAlert className="h-3.5 w-3.5" />
        critical
      </span>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link
          href="/mailer/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("actions.backToCampaigns")}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Campaign Wizard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build your campaign in 5 simple steps.
        </p>
      </div>

      <Card className="mb-4 p-4" hover={false}>
        <div className="grid gap-2 sm:grid-cols-5">
          {STEPS.map((label, idx) => {
            const number = idx + 1;
            const active = step === number;
            const done = step > number;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (number <= step) setStep(number);
                }}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-primary bg-primary/10"
                    : done
                      ? "border-success/40 bg-success/10"
                      : "border-border bg-background"
                }`}
              >
                <div className="text-xs text-muted-foreground">Step {number}</div>
                <div className="font-medium">{label}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6" hover={false}>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <h2 className="text-lg font-semibold">Step 1: Details</h2>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("newCampaign.campaignNameLabel")}</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("newCampaign.campaignNamePlaceholder")}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("newCampaign.senderNameLabel")}</span>
                <Input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder={t("newCampaign.senderNamePlaceholder")}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("newCampaign.senderEmailLabel")}</span>
                <Input
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  type="email"
                  placeholder={t("newCampaign.senderEmailPlaceholder")}
                />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <h2 className="text-lg font-semibold">Step 2: Audience</h2>
            {contactLists.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No contacts yet. Import your first list.
              </p>
            ) : (
              <div className="space-y-2">
                {contactLists.map((list) => {
                  const checked = selectedListIds.includes(list.id);
                  return (
                    <label
                      key={list.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedListIds((prev) =>
                              isChecked
                                ? [...prev, list.id]
                                : prev.filter((id) => id !== list.id),
                            );
                          }}
                        />
                        <span className="font-medium">{list.name}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {list.contactCount} recipients
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              {recipientsCount} recipients selected
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5">
            <h2 className="text-lg font-semibold">Step 3: Content</h2>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Template</span>
              <select
                value={templateId}
                onChange={(e) => {
                  const value = e.target.value;
                  setTemplateId(value);
                  const tpl = templates.find((item) => item.id === value);
                  if (!tpl) return;
                  setSubject(tpl.subject);
                  setHtml(tpl.html);
                }}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">No template</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.category})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("newCampaign.emailSubjectLabel")}</span>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("newCampaign.emailSubjectPlaceholder")}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Preview text (optional)</span>
              <Input
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Short inbox preview text"
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("newCampaign.htmlBodyLabel")}</span>
              <Textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder={t("newCampaign.htmlBodyPlaceholder")}
                className="min-h-[220px] font-mono text-xs"
              />
            </label>

            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 text-sm font-medium">Preview</div>
              <div className="text-xs text-muted-foreground">Subject: {subject || "—"}</div>
              <div className="mb-3 text-xs text-muted-foreground">Preview text: {previewText || "—"}</div>
              <div
                className="prose max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: html || "<p>Preview will appear here.</p>" }}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-5">
            <h2 className="text-lg font-semibold">Step 4: Preflight</h2>
            <p className="text-sm text-muted-foreground">
              Preflight runs automatically and shows simplified guidance.
            </p>

            {preflightLoading ? (
              <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                Running checks...
              </div>
            ) : preflight ? (
              <div className="rounded-lg border border-border p-4">
                <div className="mb-3">{statusBadge(preflight.status)}</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {preflight.recommendations.map((item, idx) => (
                    <li key={`${item}-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                No preflight result yet.
              </div>
            )}

            <div>
              <Button
                variant="outline"
                onClick={() => void runPreflight(true)}
                loading={preflightLoading}
              >
                Re-run preflight
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-5">
            <h2 className="text-lg font-semibold">Step 5: Send</h2>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Delivery</span>
              <select
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value as "now" | "schedule")}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="now">Send now</option>
                <option value="schedule">Schedule</option>
              </select>
            </label>

            {sendMode === "schedule" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">{t("newCampaign.scheduleDateLabel")}</span>
                  <Input
                    type="date"
                    lang="ka-GE"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">{t("newCampaign.scheduleTimeLabel")}</span>
                  <TimeSelect24
                    value={scheduledTime}
                    onChange={setScheduledTime}
                  />
                </label>
              </div>
            )}

            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="mb-1 font-medium">Confirmation</div>
              <div className="text-muted-foreground">Sender: {senderEmail || "—"}</div>
              <div className="text-muted-foreground">Recipients: {recipientsCount}</div>
              <div className="text-muted-foreground">Subject: {subject || "—"}</div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmReady}
                onChange={(e) => setConfirmReady(e.target.checked)}
              />
              I confirm this campaign is ready to send
            </label>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (step === 1) {
                router.push("/mailer/campaigns");
                return;
              }
              setStep((prev) => Math.max(1, prev - 1));
            }}
          >
            Back
          </Button>

          {step < 5 ? (
            <Button
              type="button"
              onClick={() => setStep((prev) => Math.min(5, prev + 1))}
              disabled={!canGoNext(step)}
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleFinish()}
              loading={saving}
              disabled={!confirmReady || !preflight || preflightLoading || preflightKey !== preflightFingerprint}
            >
              {saving ? "Finalizing..." : sendMode === "now" ? "Send campaign" : "Schedule campaign"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
