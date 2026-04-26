"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { MailerLoginPage } from "../../login-page";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

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

type StepKey = "details" | "recipients" | "content" | "review";
const STEPS: StepKey[] = ["details", "recipients", "content", "review"];

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

function readApiError(body: ApiErrorShape | null, fallback: string): string {
  const apiError = body?.error;
  if (typeof apiError === "string") return apiError;
  if (typeof apiError?.message === "string") return apiError.message;
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

function TimeSelect24({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { hour, minute } = parseTimeParts(value);
  const selectClass = cn(
    "h-11 rounded-lg border border-border/80 bg-background/80 px-3 text-sm",
    "outline-none transition-colors hover:border-border",
    "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
  );

  return (
    <div className="flex items-center gap-2">
      <select
        value={hour}
        onChange={(e) => onChange(buildHHmm(e.target.value, minute))}
        className={selectClass}
        aria-label="Hours"
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
        className={selectClass}
        aria-label="Minutes"
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

interface StepperProps {
  current: number; // 1-indexed
  steps: Array<{ key: StepKey; label: string }>;
  onSelect: (step: number) => void;
}

function Stepper({ current, steps, onSelect }: StepperProps) {
  const t = useTranslations("mailer.newCampaign");
  return (
    <ol
      aria-label="Wizard steps"
      className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4"
    >
      {steps.map((step, idx) => {
        const num = idx + 1;
        const status = num < current ? "done" : num === current ? "active" : "pending";
        const clickable = num <= current;
        return (
          <li key={step.key} className="min-w-0">
            <button
              type="button"
              onClick={() => clickable && onSelect(num)}
              disabled={!clickable}
              aria-current={status === "active" ? "step" : undefined}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                status === "active" &&
                  "border-primary/40 bg-primary/5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
                status === "done" &&
                  "border-border/70 bg-card hover:border-border cursor-pointer",
                status === "pending" &&
                  "cursor-not-allowed border-dashed border-border/60 bg-card/40 opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ring-1",
                  status === "active" && "bg-primary text-primary-foreground ring-primary/30",
                  status === "done" && "bg-success/10 text-success ring-success/30",
                  status === "pending" && "bg-muted text-muted-foreground ring-border",
                )}
                aria-hidden
              >
                {status === "done" ? <Check className="h-3.5 w-3.5" /> : num}
              </span>
              <div className="min-w-0">
                <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {t("stepNumber", { step: num })}
                </div>
                <div className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                  {step.label}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CheckStatusBadge({ status, t }: { status: PreflightResult["status"]; t: ReturnType<typeof useTranslations> }) {
  if (status === "good") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[12px] font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.4} />
        {t("review.checksOk")}
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[12px] font-medium text-warning">
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.4} />
        {t("review.checksWarn")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-[12px] font-medium text-destructive">
      <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
      {t("review.checksFail")}
    </span>
  );
}

export default function NewCampaignPage() {
  const { user, apiFetch } = useMailerAuth();
  const router = useRouter();
  const t = useTranslations("mailer");
  const tw = useTranslations("mailer.newCampaign");

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sampleCreating, setSampleCreating] = useState(false);

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

  const isSampleSeedAllowed = process.env.NODE_ENV !== "production";

  const loadContactLists = useCallback(async () => {
    try {
      const listsRes = await apiFetch("/api/desktop/contact-lists?page=1&limit=100");
      if (!listsRes.ok) return;
      const listsBody = await listsRes.json();
      setContactLists(listsBody.data ?? []);
    } catch {
      // keep current state
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const [templatesRes, listsRes] = await Promise.all([
          apiFetch("/api/desktop/templates"),
          apiFetch("/api/desktop/contact-lists?page=1&limit=100"),
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
  const hasAudienceLists = contactLists.some((list) => Number(list.contactCount ?? 0) > 0);

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
    return true;
  };

  const runPreflight = useCallback(
    async (force = false) => {
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
          throw new Error(readApiError(body, t("errors.createCampaignFailed")));
        }
        const body = (await res.json()) as { data: PreflightResult };
        setPreflight(body.data);
        setPreflightKey(preflightFingerprint);
      } catch (err) {
        setPreflight(null);
        setError(err instanceof Error ? err.message : t("errors.createCampaignFailed"));
      } finally {
        setPreflightLoading(false);
      }
    },
    [
      apiFetch,
      audienceValid,
      contentValid,
      detailsValid,
      html,
      preflight,
      preflightFingerprint,
      preflightKey,
      previewText,
      recipientsCount,
      senderEmail,
      subject,
      t,
    ],
  );

  // Auto-run preflight once user reaches the Review step (or any field changes while there).
  useEffect(() => {
    if (step !== 4) return;
    void runPreflight();
  }, [step, preflightFingerprint, runPreflight]);

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
      throw new Error(readApiError(body, t("errors.assignListFailed")));
    }
    const body = (await res.json()) as { data: { id: string } };
    return body.data.id;
  }

  async function handleCreateSampleList() {
    setError("");
    setSampleCreating(true);
    try {
      const res = await apiFetch("/api/desktop/contact-lists/sample", {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
      if (!res.ok) {
        throw new Error(readApiError(body, t("errors.createListFailed")));
      }
      await loadContactLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createListFailed"));
    } finally {
      setSampleCreating(false);
    }
  }

  /**
   * Persists the campaign without sending or scheduling.
   * Used by `Send now`, `Schedule`, and `Save as draft` — the difference is
   * what we do (or don't do) afterwards.
   */
  async function persistCampaign(scheduledAtIso: string | null): Promise<string> {
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
        scheduledAt: scheduledAtIso || undefined,
        preflight: preflight
          ? {
              status: preflight.status.toUpperCase(),
              recommendations: preflight.recommendations,
              checkedAt: preflight.checkedAt,
            }
          : undefined,
      }),
    });

    if (!createRes.ok) {
      const body = (await createRes.json().catch(() => null)) as ApiErrorShape | null;
      throw new Error(readApiError(body, t("errors.createCampaignFailed")));
    }

    const createdBody = await createRes.json();
    return createdBody.data?.id as string;
  }

  async function handleSaveDraft() {
    setError("");
    if (!detailsValid || !audienceValid || !contentValid) {
      setError(tw("errors.completeRequired"));
      return;
    }
    setSavingDraft(true);
    try {
      const campaignId = await persistCampaign(null);
      router.push(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createCampaignFailed"));
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleFinish() {
    setError("");
    if (!detailsValid || !audienceValid || !contentValid) {
      setError(tw("errors.completeRequired"));
      return;
    }
    if (!preflight || preflightLoading || preflightKey !== preflightFingerprint) {
      setError(tw("review.checksRunning"));
      return;
    }
    if (!confirmReady) {
      setError(tw("errors.confirmRequired"));
      return;
    }

    const scheduledAtIso =
      sendMode === "schedule"
        ? localDateAndTimeToIso(scheduledDate, scheduledTime)
        : null;

    if (sendMode === "schedule" && !scheduledAtIso) {
      setError(tw("errors.scheduleDateRequired"));
      return;
    }

    setSaving(true);
    try {
      const campaignId = await persistCampaign(scheduledAtIso);

      if (sendMode === "now") {
        const sendRes = await apiFetch(`/api/desktop/campaigns/${campaignId}/send`, {
          method: "POST",
        });
        if (!sendRes.ok) {
          const body = (await sendRes.json().catch(() => null)) as ApiErrorShape | null;
          throw new Error(readApiError(body, t("errors.sendCampaignFailed")));
        }
      }

      router.push(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createCampaignFailed"));
    } finally {
      setSaving(false);
    }
  }

  const stepDefs: Array<{ key: StepKey; label: string }> = STEPS.map((key) => ({
    key,
    label: tw(`steps.${key}`),
  }));

  const selectClass = cn(
    "h-11 w-full rounded-lg border border-border/80 bg-background/80 px-3 text-sm",
    "outline-none transition-colors hover:border-border",
    "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("actions.backToCampaigns")}
        </Link>
        <PageHeader title={tw("title")} description={tw("description")} />
      </div>

      <Stepper current={step} steps={stepDefs} onSelect={setStep} />

      <SectionCard padded>
        {error && (
          <Alert variant="destructive" className="mb-5">
            {error}
          </Alert>
        )}

        {/* Step 1 — Details */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {tw("steps.details")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tw("campaignNameHelp")}
              </p>
            </div>
            <div className="space-y-4">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">{tw("campaignNameLabel")}</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tw("campaignNamePlaceholder")}
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{tw("senderNameLabel")}</span>
                  <Input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder={tw("senderNamePlaceholder")}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{tw("senderEmailLabel")}</span>
                  <Input
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    type="email"
                    placeholder={tw("senderEmailPlaceholder")}
                    required
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Recipients */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {tw("audience.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tw("audience.description")}
              </p>
            </div>

            {!hasAudienceLists ? (
              <EmptyState
                icon={<Users strokeWidth={1.8} />}
                title={tw("audience.noListsTitle")}
                description={tw("audience.noListsDescription")}
                action={{ label: tw("audience.noListsAction"), href: "/contacts" }}
                secondaryAction={
                  isSampleSeedAllowed
                    ? {
                        label: sampleCreating ? t("actions.creating") : tw("audience.addSampleAction"),
                        onClick: () => void handleCreateSampleList(),
                      }
                    : undefined
                }
              />
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  {contactLists.map((list) => {
                    const checked = selectedListIds.includes(list.id);
                    const isUsable = Number(list.contactCount ?? 0) > 0;
                    return (
                      <label
                        key={list.id}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
                          isUsable
                            ? checked
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/70 bg-card hover:border-border"
                            : "cursor-not-allowed border-border/60 bg-muted/30 opacity-70",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!isUsable}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setSelectedListIds((prev) =>
                                isChecked
                                  ? [...prev, list.id]
                                  : prev.filter((id) => id !== list.id),
                              );
                            }}
                            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                          />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
                            {list.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                          {tw("audience.listMembers", { count: Number(list.contactCount ?? 0) })}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-[hsl(var(--muted)/0.45)] px-4 py-3 text-[13px]">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" strokeWidth={2.2} />
                    {tw("audience.selectedSummary", { count: recipientsCount })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Content */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {tw("steps.content")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{tw("emailSubjectHelp")}</p>
            </div>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{tw("templateLabel")}</span>
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
                className={selectClass}
              >
                <option value="">{tw("templateNoneOption")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{tw("emailSubjectLabel")}</span>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={tw("emailSubjectPlaceholder")}
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{tw("previewTextLabel")}</span>
              <Input
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder={tw("previewTextPlaceholder")}
              />
              <span className="text-[12px] text-muted-foreground">{tw("previewTextHelp")}</span>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{tw("htmlBodyLabel")}</span>
              <Textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder={tw("htmlBodyPlaceholder")}
                className="min-h-[220px] font-mono text-xs"
                required
              />
              <span className="text-[12px] text-muted-foreground">{tw("htmlBodyHelp")}</span>
            </label>

            <div className="rounded-xl border border-border/70 bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                  {tw("preview.title")}
                </h3>
              </div>
              <dl className="space-y-1.5 text-[12.5px]">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">{tw("preview.subject")}</dt>
                  <dd className="text-foreground">{subject || "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">{tw("preview.previewText")}</dt>
                  <dd className="text-foreground">{previewText || "—"}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-border/60 bg-background p-4">
                {html.trim() ? (
                  <div
                    className="prose max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{tw("preview.empty")}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4 — Review & Send */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {tw("review.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{tw("review.description")}</p>
            </div>

            {/* Summary */}
            <section className="rounded-xl border border-border/70 bg-card p-4">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {tw("review.summarySection")}
              </h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[12px] text-muted-foreground">{tw("review.summaryName")}</dt>
                  <dd className="mt-0.5 truncate text-[14px] font-medium text-foreground">
                    {name || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted-foreground">{tw("review.summarySender")}</dt>
                  <dd className="mt-0.5 truncate text-[14px] font-medium text-foreground">
                    {senderEmail || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted-foreground">{tw("review.summaryRecipients")}</dt>
                  <dd className="mt-0.5 text-[14px] font-medium tabular-nums text-foreground">
                    {recipientsCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted-foreground">{tw("review.summarySubject")}</dt>
                  <dd className="mt-0.5 truncate text-[14px] font-medium text-foreground">
                    {subject || "—"}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Pre-send checks (formerly preflight) */}
            <section className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {tw("review.checksSection")}
                </h3>
                {preflightLoading ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {tw("review.checksRunning")}
                  </span>
                ) : preflight ? (
                  <CheckStatusBadge status={preflight.status} t={tw} />
                ) : null}
              </div>
              {preflight && preflight.recommendations.length > 0 ? (
                <ul className="mt-3 space-y-1.5 pl-5 text-[13px] text-muted-foreground" style={{ listStyleType: "disc" }}>
                  {preflight.recommendations.map((item, idx) => (
                    <li key={`${item}-${idx}`}>{item}</li>
                  ))}
                </ul>
              ) : preflight ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  {preflight.status === "good"
                    ? tw("review.checksOkDescription")
                    : tw("review.noRecommendations")}
                </p>
              ) : null}
            </section>

            {/* Delivery */}
            <section className="space-y-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                  {tw("send.title")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{tw("send.description")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DeliveryOption
                  selected={sendMode === "now"}
                  onSelect={() => setSendMode("now")}
                  icon={<Send className="h-4 w-4" strokeWidth={2.2} />}
                  label={tw("send.modeNow")}
                />
                <DeliveryOption
                  selected={sendMode === "schedule"}
                  onSelect={() => setSendMode("schedule")}
                  icon={<Clock className="h-4 w-4" strokeWidth={2.2} />}
                  label={tw("send.modeSchedule")}
                />
              </div>

              {sendMode === "schedule" && (
                <div className="grid gap-4 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-foreground">
                      {tw("scheduleDateLabel")}
                    </span>
                    <Input
                      type="date"
                      lang="ka-GE"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-foreground">
                      {tw("scheduleTimeLabel")}
                    </span>
                    <TimeSelect24 value={scheduledTime} onChange={setScheduledTime} />
                  </label>
                </div>
              )}
            </section>

            {/* Confirm */}
            <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-[hsl(var(--muted)/0.4)] p-4 text-[13.5px]">
              <input
                type="checkbox"
                checked={confirmReady}
                onChange={(e) => setConfirmReady(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
              />
              <span className="text-foreground">{tw("review.confirmLabel")}</span>
            </label>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-8 flex flex-col-reverse items-stretch gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              if (step === 1) {
                router.push("/campaigns");
                return;
              }
              setStep((prev) => Math.max(1, prev - 1));
            }}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            {step === 1 ? tw("actions.cancel") : tw("actions.back")}
          </Button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {step === 4 && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => void handleSaveDraft()}
                loading={savingDraft}
                disabled={savingDraft || saving}
              >
                {savingDraft ? tw("actions.savingDraft") : tw("actions.saveDraft")}
              </Button>
            )}

            {step < 4 ? (
              <Button
                type="button"
                onClick={() => setStep((prev) => Math.min(4, prev + 1))}
                disabled={!canGoNext(step)}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {tw("actions.next")}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleFinish()}
                loading={saving}
                disabled={
                  saving ||
                  savingDraft ||
                  !confirmReady ||
                  !preflight ||
                  preflightLoading ||
                  preflightKey !== preflightFingerprint
                }
                rightIcon={<Send className="h-4 w-4" />}
              >
                {saving
                  ? tw("actions.working")
                  : sendMode === "now"
                    ? tw("actions.sendNow")
                    : tw("actions.schedule")}
              </Button>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function DeliveryOption({
  selected,
  onSelect,
  icon,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]"
          : "border-border/70 bg-card hover:border-border",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg ring-1 transition-colors",
          selected
            ? "bg-primary text-primary-foreground ring-primary/30"
            : "bg-muted text-foreground/80 ring-border",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-medium tracking-tight text-foreground">
        {label}
      </span>
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-full border transition-colors",
          selected ? "border-primary bg-primary" : "border-border bg-card",
        )}
        aria-hidden
      />
    </button>
  );
}
