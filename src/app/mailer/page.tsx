"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { DomainHealthStatus } from "@/components/ui/domain-health-status";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard, type MetricTone } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill, type CampaignStatus } from "@/components/ui/status-pill";
import { WorkerStatus } from "@/components/ui/worker-status";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  ArrowRight,
  Activity,
  Mail,
  MailOpen,
  MousePointerClick,
  Plus,
  Send,
} from "lucide-react";
import { MailerLoginPage } from "./login-page";
import { useTranslations } from "next-intl";

interface ActiveCampaign {
  id: string;
  name: string;
  status: "DRAFT" | "QUEUED" | "SENDING" | "PAUSED" | "COMPLETED" | "FAILED";
  scheduledAt?: string | null;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  updatedAt?: string | null;
}

interface QueueSnapshot {
  available: boolean;
  jobId: string | null;
  state: string | null;
  progress: number;
  processed: number;
  sent: number;
  failed: number;
  total: number;
}

interface ActiveCampaignResponse {
  campaign: ActiveCampaign | null;
  queue: QueueSnapshot | null;
}

function toCampaignStatus(
  raw: ActiveCampaign["status"],
  scheduledAt?: string | null,
): CampaignStatus {
  if (raw === "DRAFT" && scheduledAt) return "scheduled";
  switch (raw) {
    case "DRAFT":
      return "draft";
    case "QUEUED":
      return "ready";
    case "SENDING":
      return "sending";
    case "PAUSED":
      return "paused";
    case "COMPLETED":
      return "sent";
    case "FAILED":
      return "failed";
    default:
      return "draft";
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

type QueueStateKey =
  | "unavailable"
  | "idle"
  | "active"
  | "waiting"
  | "completed"
  | "failed";

function resolveQueueStateKey(
  state: string | null | undefined,
  available: boolean,
): QueueStateKey | null {
  if (!available) return "unavailable";
  if (!state) return "idle";
  if (state === "active") return "active";
  if (state === "waiting" || state === "delayed") return "waiting";
  if (state === "completed") return "completed";
  if (state === "failed") return "failed";
  return null;
}

export default function MailerDashboard() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");
  const [campaign, setCampaign] = useState<ActiveCampaign | null>(null);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function loadActiveCampaign() {
      try {
        const res = await apiFetch("/api/desktop/campaigns/active");
        if (!mounted) return;
        if (!res.ok) {
          setCampaign(null);
          setQueue(null);
          return;
        }
        const body = (await res.json()) as ActiveCampaignResponse;
        setCampaign(body.campaign);
        setQueue(body.queue);
      } catch {
        if (!mounted) return;
        setCampaign(null);
        setQueue(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadActiveCampaign();
    const interval = setInterval(loadActiveCampaign, 5_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user, apiFetch]);

  const status = campaign ? toCampaignStatus(campaign.status, campaign.scheduledAt) : "draft";
  const totalSent = campaign?.sentCount ?? 0;
  const openRate = useMemo(
    () => formatPercent(campaign?.openCount ?? 0, totalSent),
    [campaign?.openCount, totalSent],
  );
  const clickRate = useMemo(
    () => formatPercent(campaign?.clickCount ?? 0, totalSent),
    [campaign?.clickCount, totalSent],
  );
  const queueTotal = queue?.total ?? campaign?.totalCount ?? 0;
  const queueProcessed = queue?.processed ?? ((campaign?.sentCount ?? 0) + (campaign?.failedCount ?? 0));
  const queueSent = queue?.sent ?? campaign?.sentCount ?? 0;
  const queueProgress =
    typeof queue?.progress === "number"
      ? queue.progress
      : queueTotal > 0
        ? Math.min(100, Math.round((queueProcessed / queueTotal) * 100))
        : 0;
  const metrics: Array<{
    key: string;
    label: string;
    value: string;
    description: string;
    icon: React.ReactNode;
    tone: MetricTone;
  }> = [
    {
      key: "sent",
      label: t("dashboard.metrics.totalSent"),
      value: loading ? "—" : formatNumber(totalSent),
      description: campaign
        ? t("dashboard.metrics.totalSentWithCampaign")
        : t("dashboard.metrics.totalSentNoCampaign"),
      icon: <Send className="h-4 w-4" strokeWidth={2.2} />,
      tone: "primary",
    },
    {
      key: "openRate",
      label: t("dashboard.metrics.openRate"),
      value: loading ? "—" : openRate,
      description: t("dashboard.metrics.openRateDescription"),
      icon: <MailOpen className="h-4 w-4" strokeWidth={2.2} />,
      tone: "success",
    },
    {
      key: "clickRate",
      label: t("dashboard.metrics.clickRate"),
      value: loading ? "—" : clickRate,
      description: t("dashboard.metrics.clickRateDescription"),
      icon: <MousePointerClick className="h-4 w-4" strokeWidth={2.2} />,
      tone: "accent",
    },
  ];

  const queueStateKey = resolveQueueStateKey(queue?.state, queue?.available ?? false);
  const queueStateLabel = queueStateKey
    ? t(`dashboard.queueMonitor.states.${queueStateKey}`)
    : queue?.state || "";

  if (!user) return <MailerLoginPage />;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow={t("dashboard.workspaceLabel")}
        title={t("dashboard.missionControl.title")}
        description={t("dashboard.missionControl.description")}
        center={
          <div className="flex flex-wrap items-center gap-3">
            <WorkerStatus />
            <DomainHealthStatus />
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <ButtonLink
              href="/campaigns/new"
              size="md"
              leftIcon={<Plus className="h-4 w-4" />}
              className="min-h-11 rounded-xl px-4 font-extrabold"
            >
              {t("actions.newCampaign")}
            </ButtonLink>
          </div>
        }
      />

      {!campaign && !loading ? (
        <SectionCard padded={false} bodyClassName="p-6 sm:p-8">
          <EmptyState
            icon={<Mail strokeWidth={1.8} />}
            title={t("dashboard.emptyState.title")}
            description={t("dashboard.missionControl.emptyDescription")}
            action={{
              label: t("dashboard.emptyState.action"),
              href: "/campaigns/new",
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard
          title={campaign?.name ?? t("dashboard.missionControl.loadingCampaign")}
          description={t("dashboard.missionControl.description")}
          actions={
            campaign ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  kind="campaign"
                  status={status}
                  label={t(`campaigns.status.${status}`)}
                />
                <ButtonLink
                  href={`/campaigns/${campaign.id}`}
                  variant="secondary"
                  size="sm"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  {t("dashboard.openCampaign")}
                </ButtonLink>
              </div>
            ) : undefined
          }
          bodyClassName="p-6 sm:p-8"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <section
                aria-label="Current campaign stats"
                className="grid gap-4 sm:grid-cols-3"
              >
                {metrics.map((metric) => (
                  <MetricCard
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    description={metric.description}
                    icon={metric.icon}
                    tone={metric.tone}
                  />
                ))}
              </section>

              <div className="rounded-[32px] border-2 border-slate-100 bg-white p-8 dark:border-border dark:bg-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-600 dark:text-primary">
                      <Activity className="h-3.5 w-3.5" strokeWidth={2.4} />
                      {t("dashboard.queueMonitor.eyebrow")}
                    </div>
                    <h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-foreground">
                      {queueStateLabel}
                    </h3>
                  </div>
                  <div className="text-right text-sm font-bold tabular-nums text-slate-500 dark:text-muted-foreground">
                    {t("dashboard.queueMonitor.sentOf", {
                      sent: formatNumber(queueSent),
                      total: formatNumber(queueTotal),
                    })}
                  </div>
                </div>
                <Progress value={queueProgress} className="mt-6" size="lg" />
                <div className="mt-4 flex flex-wrap items-center gap-4 text-[12.5px] font-medium text-slate-500 dark:text-muted-foreground">
                  <span>{t("dashboard.queueMonitor.progress", { value: queueProgress })}</span>
                  <span>
                    {t("dashboard.queueMonitor.sent", {
                      value: formatNumber(queue?.sent ?? campaign?.sentCount ?? 0),
                    })}
                  </span>
                  <span>
                    {t("dashboard.queueMonitor.failed", {
                      value: formatNumber(queue?.failed ?? campaign?.failedCount ?? 0),
                    })}
                  </span>
                </div>
              </div>
            </div>

            <aside className="rounded-[32px] border-2 border-slate-100 bg-white p-8 dark:border-border dark:bg-card">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-600 dark:text-primary">
                {t("dashboard.currentTask.eyebrow")}
              </div>
              <h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-foreground">
                {campaign?.name ?? t("dashboard.missionControl.loadingCampaign")}
              </h3>
              <dl className="mt-6 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4 border-b border-slate-50 pb-4 dark:border-border/60">
                  <dt className="font-medium text-slate-500 dark:text-muted-foreground">
                    {t("dashboard.currentTask.recipients")}
                  </dt>
                  <dd className="font-bold tabular-nums text-slate-950 dark:text-foreground">
                    {formatNumber(campaign?.totalCount ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-slate-50 pb-4 dark:border-border/60">
                  <dt className="font-medium text-slate-500 dark:text-muted-foreground">
                    {t("dashboard.currentTask.opened")}
                  </dt>
                  <dd className="font-bold tabular-nums text-slate-950 dark:text-foreground">
                    {formatNumber(campaign?.openCount ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-slate-50 pb-4 dark:border-border/60">
                  <dt className="font-medium text-slate-500 dark:text-muted-foreground">
                    {t("dashboard.currentTask.clicked")}
                  </dt>
                  <dd className="font-bold tabular-nums text-slate-950 dark:text-foreground">
                    {formatNumber(campaign?.clickCount ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="font-medium text-slate-500 dark:text-muted-foreground">
                    {t("dashboard.currentTask.bounced")}
                  </dt>
                  <dd className="font-bold tabular-nums text-slate-950 dark:text-foreground">
                    {formatNumber(campaign?.bounceCount ?? 0)}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
