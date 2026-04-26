"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard, type MetricTone } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import {
  StatusPill,
  type CampaignStatus,
  type SenderStatus,
} from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Mail,
  MailOpen,
  MousePointerClick,
  Plus,
  Send,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { MailerLoginPage } from "./login-page";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface CampaignItem {
  id: string;
  name: string;
  status: "DRAFT" | "QUEUED" | "SENDING" | "PAUSED" | "COMPLETED" | "FAILED";
  scheduledAt?: string | null;
  sentCount: number;
  openCount: number;
  clickCount: number;
}

interface DashboardStats {
  totalCampaigns: number;
  totalContacts: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
}

interface PaginationMeta {
  total?: number;
}

interface TrackingStatsResponse {
  total_sent?: number;
  opened?: number;
  clicked?: number;
}

interface SendingAccountItem {
  id: string;
  active: boolean;
  status: "NOT_TESTED" | "CONNECTED" | "FAILED" | "NEEDS_ATTENTION" | "PAUSED" | "TESTING";
}

// Local narrowing: dashboard's resolveSenderStatus only ever returns these
// three. (The full StatusPill enum also includes "paused" for the Settings
// page, but the dashboard does not surface that distinction.)
type DashboardSenderStatus = Extract<SenderStatus, "connected" | "needsAttention" | "notSetUp">;

// ─── Status mapping (raw API → canonical mailer status) ───────────────────
function toCampaignStatus(
  raw: CampaignItem["status"],
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

function resolveSenderStatus(accounts: SendingAccountItem[]): DashboardSenderStatus {
  if (accounts.length === 0) return "notSetUp";
  if (accounts.some((a) => a.status === "CONNECTED" && a.active)) return "connected";
  if (
    accounts.some(
      (a) =>
        ["FAILED", "NEEDS_ATTENTION", "PAUSED"].includes(a.status) || !a.active,
    )
  ) {
    return "needsAttention";
  }
  return "notSetUp";
}

export default function MailerDashboard() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");
  const [stats, setStats] = useState<DashboardStats>({
    totalCampaigns: 0,
    totalContacts: 0,
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
  });
  const [recentCampaigns, setRecentCampaigns] = useState<CampaignItem[]>([]);
  const [senderStatus, setSenderStatus] = useState<DashboardSenderStatus>("notSetUp");
  const [senderAccountCount, setSenderAccountCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function loadDashboard() {
      try {
        const [campaignsRes, trackingRes, accountsRes] = await Promise.all([
          apiFetch("/api/desktop/campaigns?page=1&limit=10"),
          apiFetch("/api/tracking/stats"),
          apiFetch("/api/desktop/sending-accounts"),
        ]);

        const campaignsBody = campaignsRes.ok
          ? ((await campaignsRes.json()) as {
              data?: CampaignItem[];
              meta?: PaginationMeta;
              pagination?: PaginationMeta;
            })
          : null;

        const trackingBody = trackingRes.ok
          ? ((await trackingRes.json()) as TrackingStatsResponse)
          : null;

        const accountsBody = accountsRes.ok
          ? ((await accountsRes.json()) as { data?: SendingAccountItem[] })
          : null;

        const loadTotalContacts = async (): Promise<number> => {
          const pageSize = 100;
          let page = 1;
          let pages = 1;
          let totalContacts = 0;

          while (page <= pages) {
            const contactsRes = await apiFetch(
              `/api/desktop/contact-lists?page=${page}&limit=${pageSize}`,
            );
            if (!contactsRes.ok) break;

            const contactsBody = (await contactsRes.json()) as {
              data?: Array<{ contactCount?: number }>;
              meta?: PaginationMeta;
              pagination?: PaginationMeta;
            };

            const contactLists = contactsBody.data ?? [];
            totalContacts += contactLists.reduce(
              (acc, item) => acc + Number(item.contactCount ?? 0),
              0,
            );

            const contactsMeta = contactsBody.meta ?? contactsBody.pagination;
            const totalLists = Number(contactsMeta?.total ?? contactLists.length);
            pages = Math.max(1, Math.ceil(totalLists / pageSize));
            page += 1;
          }

          return totalContacts;
        };

        const totalContacts = await loadTotalContacts();

        const campaigns = campaignsBody?.data ?? [];
        const campaignMeta = campaignsBody?.meta ?? campaignsBody?.pagination;
        const fallbackTotals = campaigns.reduce(
          (acc, item) => {
            acc.sent += Number(item.sentCount ?? 0);
            acc.opened += Number(item.openCount ?? 0);
            acc.clicked += Number(item.clickCount ?? 0);
            return acc;
          },
          { sent: 0, opened: 0, clicked: 0 },
        );

        setStats({
          totalCampaigns: Number(campaignMeta?.total ?? campaigns.length),
          totalContacts,
          totalSent: Number(trackingBody?.total_sent ?? fallbackTotals.sent),
          totalOpened: Number(trackingBody?.opened ?? fallbackTotals.opened),
          totalClicked: Number(trackingBody?.clicked ?? fallbackTotals.clicked),
        });
        setRecentCampaigns(campaigns.slice(0, 10));
        const accounts = accountsBody?.data ?? [];
        setSenderAccountCount(accounts.length);
        setSenderStatus(resolveSenderStatus(accounts));
      } catch {
        // keep zeroed dashboard on load errors
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [user, apiFetch]);

  const hasCampaigns = useMemo(() => stats.totalCampaigns > 0, [stats.totalCampaigns]);
  const hasContacts = useMemo(() => stats.totalContacts > 0, [stats.totalContacts]);
  const openRate = useMemo(
    () => formatPercent(stats.totalOpened, stats.totalSent),
    [stats.totalOpened, stats.totalSent],
  );
  const clickRate = useMemo(
    () => formatPercent(stats.totalClicked, stats.totalSent),
    [stats.totalClicked, stats.totalSent],
  );
  const hasEngagement = stats.totalSent > 0;

  const senderStatusConfig = {
    connected: {
      icon: CheckCircle2,
      iconClasses: "bg-success/10 text-success ring-success/15",
      label: t("dashboard.senderStatus.connected"),
      description: t("dashboard.senderStatus.connectedDescription"),
    },
    needsAttention: {
      icon: AlertCircle,
      iconClasses: "bg-warning/10 text-warning ring-warning/15",
      label: t("dashboard.senderStatus.needsAttention"),
      description: t("dashboard.senderStatus.needsAttentionDescription"),
    },
    notSetUp: {
      icon: AlertCircle,
      iconClasses: "bg-muted text-muted-foreground ring-border",
      label: t("dashboard.senderStatus.notSetUp"),
      description: t("dashboard.senderStatus.notSetUpDescription"),
    },
  }[senderStatus];
  const SenderStatusIcon = senderStatusConfig.icon;

  if (!user) return <MailerLoginPage />;

  // ─── Data for repeating sections (declarative) ──────────────────────────
  const kpis: Array<{
    key: string;
    label: string;
    value: string;
    description: string;
    icon: React.ReactNode;
    tone: MetricTone;
  }> = [
    {
      key: "totalCampaigns",
      label: t("dashboard.kpis.totalCampaigns"),
      description: t("dashboard.kpis.totalCampaignsDescription"),
      value: loading ? "—" : formatNumber(stats.totalCampaigns),
      icon: <Mail className="h-4 w-4" strokeWidth={2.2} />,
      tone: "primary",
    },
    {
      key: "emailsSent",
      label: t("dashboard.kpis.emailsSent"),
      description: t("dashboard.kpis.emailsSentDescription"),
      value: loading ? "—" : formatNumber(stats.totalSent),
      icon: <Send className="h-4 w-4" strokeWidth={2.2} />,
      tone: "neutral",
    },
    {
      key: "openRate",
      label: t("dashboard.kpis.openRate"),
      description: hasEngagement
        ? t("dashboard.kpis.openRateDescription")
        : t("dashboard.kpis.noEngagementDescription"),
      value: loading ? "—" : openRate,
      icon: <MailOpen className="h-4 w-4" strokeWidth={2.2} />,
      tone: "success",
    },
    {
      key: "clickRate",
      label: t("dashboard.kpis.clickRate"),
      description: hasEngagement
        ? t("dashboard.kpis.clickRateDescription")
        : t("dashboard.kpis.noEngagementDescription"),
      value: loading ? "—" : clickRate,
      icon: <MousePointerClick className="h-4 w-4" strokeWidth={2.2} />,
      tone: "accent",
    },
  ];

  const quickActions = [
    {
      title: t("dashboard.quickActions.createCampaign.title"),
      description: t("dashboard.quickActions.createCampaign.description"),
      href: "/campaigns/new",
      icon: Plus,
      primary: true,
      action: t("dashboard.quickActions.createCampaign.action"),
    },
    {
      title: t("dashboard.quickActions.importContacts.title"),
      description: t("dashboard.quickActions.importContacts.description"),
      href: "/contacts",
      icon: Upload,
      primary: false,
      action: t("dashboard.quickActions.importContacts.action"),
    },
    {
      title: t("dashboard.quickActions.createTemplate.title"),
      description: t("dashboard.quickActions.createTemplate.description"),
      href: "/templates/editor",
      icon: FileText,
      primary: false,
      action: t("dashboard.quickActions.createTemplate.action"),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 lg:space-y-10">
      <PageHeader
        eyebrow={t("dashboard.workspaceLabel")}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <ButtonLink
            href="/campaigns/new"
            size="lg"
            leftIcon={<Plus className="h-4 w-4" />}
            className="min-h-12 px-5 shadow-[0_8px_22px_-6px_hsl(var(--primary)/0.45)] hover:translate-y-0 hover:shadow-[0_10px_26px_-6px_hsl(var(--primary)/0.5)]"
          >
            {t("actions.newCampaign")}
          </ButtonLink>
        }
      />

      {/* KPI strip */}
      <section
        aria-label={t("dashboard.kpis.totalCampaigns")}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {kpis.map((kpi) => (
          <MetricCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            description={kpi.description}
            icon={kpi.icon}
            tone={kpi.tone}
          />
        ))}
      </section>

      {/* Quick actions */}
      <SectionCard
        title={t("dashboard.quickActionsTitle")}
        description={t("dashboard.quickActionsDescription")}
        bodyClassName="p-4 sm:p-5"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {quickActions.map(({ title, description, href, icon: Icon, primary, action }) => (
            <div
              key={title}
              className={cn(
                "group relative flex flex-col rounded-xl border bg-card p-5 transition-all duration-250",
                "shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
                "hover:border-foreground/15 hover:shadow-[0_8px_22px_-8px_hsl(var(--foreground)/0.12)]",
                "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/20",
                primary ? "border-primary/25" : "border-border/70",
              )}
            >
              {primary && (
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
                  aria-hidden
                />
              )}
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg ring-1 transition-colors duration-250",
                    primary
                      ? "bg-primary text-primary-foreground ring-primary/30 shadow-[0_4px_10px_-4px_hsl(var(--primary)/0.5)]"
                      : "bg-muted text-foreground/80 ring-border group-hover:bg-foreground/5",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                </div>
                {primary && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
                    <Sparkles className="h-3 w-3" />
                    {t("dashboard.recommended")}
                  </span>
                )}
              </div>
              <div className="mt-5 flex-1 space-y-1.5">
                <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
                  {title}
                </h3>
                <p className="text-sm leading-[1.55] text-muted-foreground">{description}</p>
              </div>
              <ButtonLink
                href={href}
                variant={primary ? "primary" : "secondary"}
                size="sm"
                className="mt-6 min-h-10 w-full justify-between"
                rightIcon={
                  <ArrowRight className="h-4 w-4 transition-transform duration-250 group-hover:translate-x-0.5" />
                }
              >
                {action}
              </ButtonLink>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Recent activity + sidebar */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard
          title={t("dashboard.recentActivity")}
          description={t("dashboard.recentDescription")}
          actions={
            hasCampaigns ? (
              <ButtonLink
                href="/campaigns"
                variant="ghost"
                size="sm"
                className="min-h-9 text-[13px] text-muted-foreground hover:text-foreground"
                rightIcon={<ArrowUpRight className="h-3.5 w-3.5" />}
              >
                {t("dashboard.viewAllCampaigns")}
              </ButtonLink>
            ) : undefined
          }
          padded={false}
        >
          {!hasCampaigns ? (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={<Mail strokeWidth={1.8} />}
                title={t("dashboard.emptyState.title")}
                description={t("dashboard.emptyState.description")}
                action={{
                  label: t("dashboard.emptyState.action"),
                  href: "/campaigns/new",
                }}
              />
            </div>
          ) : (
            <div>
              <div className="hidden grid-cols-[minmax(220px,1fr)_120px_90px_120px_88px] gap-4 border-b border-border/60 bg-[hsl(var(--muted)/0.45)] px-6 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
                <span>{t("dashboard.table.campaign")}</span>
                <span>{t("dashboard.table.status")}</span>
                <span className="text-right tabular-nums">{t("dashboard.table.sent")}</span>
                <span className="text-right tabular-nums">{t("dashboard.table.openRate")}</span>
                <span />
              </div>
              <div className="divide-y divide-border/60">
                {recentCampaigns.slice(0, 6).map((campaign) => {
                  const sent = Number(campaign.sentCount ?? 0);
                  const opened = Number(campaign.openCount ?? 0);
                  const clicked = Number(campaign.clickCount ?? 0);
                  const openRateValue = sent > 0 ? Math.round((opened / sent) * 100) : 0;
                  const clickRateValue = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
                  const status = toCampaignStatus(campaign.status, campaign.scheduledAt);

                  return (
                    <div
                      key={campaign.id}
                      className="grid gap-3 px-5 py-3.5 transition-colors duration-200 hover:bg-[hsl(var(--muted)/0.5)] md:grid-cols-[minmax(220px,1fr)_120px_90px_120px_88px] md:items-center md:gap-4 md:px-6"
                    >
                      <div className="min-w-0">
                        <ButtonLink
                          href={`/campaigns/${campaign.id}`}
                          variant="link"
                          size="sm"
                          className="h-auto min-w-0 justify-start p-0 text-left text-[14px] font-medium leading-5 text-foreground hover:text-primary"
                        >
                          <span className="truncate">{campaign.name}</span>
                        </ButtonLink>
                        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground md:hidden">
                          {t("dashboard.activityLine", {
                            sent,
                            openRate: openRateValue,
                            clickRate: clickRateValue,
                          })}
                        </p>
                      </div>
                      <div>
                        <StatusPill
                          kind="campaign"
                          status={status}
                          label={t(`campaigns.status.${status}`)}
                        />
                      </div>
                      <div className="hidden text-right text-[13.5px] font-medium tabular-nums text-foreground md:block">
                        {formatNumber(sent)}
                      </div>
                      <div className="hidden text-right text-[13px] tabular-nums text-muted-foreground md:block">
                        <span className="text-foreground/85">{openRateValue}%</span>
                        <span className="mx-1.5 text-border">/</span>
                        <span>{clickRateValue}%</span>
                      </div>
                      <div className="md:text-right">
                        <ButtonLink
                          href={`/campaigns/${campaign.id}`}
                          variant="ghost"
                          size="sm"
                          className="min-h-9 w-full px-3 text-[13px] text-muted-foreground hover:text-foreground md:w-auto"
                        >
                          {t("dashboard.openCampaign")}
                        </ButtonLink>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>

        <aside className="space-y-4">
          {/* Sender status */}
          <SectionCard padded>
            <div className="flex items-center justify-between gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg ring-1",
                  senderStatusConfig.iconClasses,
                )}
                aria-hidden
              >
                <SenderStatusIcon className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </div>
              <StatusPill
                kind="sender"
                status={senderStatus}
                label={
                  loading
                    ? t("dashboard.senderStatus.checking")
                    : senderStatusConfig.label
                }
              />
            </div>
            <div className="mt-4">
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                {t("dashboard.senderStatus.title")}
              </h3>
              <p className="mt-1.5 text-sm leading-[1.55] text-muted-foreground">
                {loading
                  ? t("dashboard.senderStatus.checkingDescription")
                  : senderStatusConfig.description}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-[hsl(var(--muted)/0.55)] px-3.5 py-2.5">
              <span className="text-[12px] font-medium text-muted-foreground">
                {t("dashboard.senderStatus.accountsLabel")}
              </span>
              <span className="text-[15px] font-semibold tabular-nums text-foreground">
                {loading ? "—" : formatNumber(senderAccountCount)}
              </span>
            </div>
            <ButtonLink
              href="/smtp-pool"
              variant={senderStatus === "connected" ? "secondary" : "primary"}
              size="sm"
              className="mt-4 min-h-10 w-full justify-between"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {t("dashboard.senderStatus.action")}
            </ButtonLink>
          </SectionCard>

          {/* Contacts */}
          <SectionCard padded>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
                aria-hidden
              >
                <Users className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </div>
              <span className="text-[15px] font-semibold tabular-nums text-foreground">
                {loading ? "—" : formatNumber(stats.totalContacts)}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                {t("dashboard.contactsPrompt.title")}
              </h3>
              <p className="mt-1.5 text-sm leading-[1.55] text-muted-foreground">
                {hasContacts
                  ? t("dashboard.contactsPrompt.readyDescription")
                  : t("dashboard.contactsPrompt.description")}
              </p>
            </div>
            <ButtonLink
              href="/contacts"
              variant="secondary"
              size="sm"
              className="mt-4 min-h-10 w-full justify-between"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {t("dashboard.contactsPrompt.action")}
            </ButtonLink>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
