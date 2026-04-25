"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Mail,
  MousePointerClick,
  Plus,
  Send,
  Upload,
} from "lucide-react";
import { MailerLoginPage } from "./login-page";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

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

type SenderStatus = "connected" | "needsAttention" | "notSetUp";

function statusBadgeVariant(status: CampaignItem["status"]): "default" | "success" | "warning" | "destructive" | "secondary" {
  if (status === "COMPLETED") return "success";
  if (status === "SENDING" || status === "QUEUED") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "DRAFT" || status === "PAUSED") return "secondary";
  return "default";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function resolveSenderStatus(accounts: SendingAccountItem[]): SenderStatus {
  if (accounts.length === 0) return "notSetUp";
  if (accounts.some((account) => account.status === "CONNECTED" && account.active)) {
    return "connected";
  }
  if (
    accounts.some((account) =>
      ["FAILED", "NEEDS_ATTENTION", "PAUSED"].includes(account.status) || !account.active,
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
  const [senderStatus, setSenderStatus] = useState<SenderStatus>("notSetUp");
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
          ? (await campaignsRes.json()) as { data?: CampaignItem[]; meta?: PaginationMeta; pagination?: PaginationMeta }
          : null;

        const trackingBody = trackingRes.ok
          ? (await trackingRes.json()) as TrackingStatsResponse
          : null;

        const accountsBody = accountsRes.ok
          ? (await accountsRes.json()) as { data?: SendingAccountItem[] }
          : null;

        const loadTotalContacts = async (): Promise<number> => {
          const pageSize = 100;
          let page = 1;
          let pages = 1;
          let totalContacts = 0;

          while (page <= pages) {
            const contactsRes = await apiFetch(`/api/desktop/contact-lists?page=${page}&limit=${pageSize}`);
            if (!contactsRes.ok) {
              break;
            }

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
        setSenderStatus(resolveSenderStatus(accountsBody?.data ?? []));
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

  const senderStatusConfig = {
    connected: {
      variant: "success" as const,
      icon: CheckCircle2,
      label: t("dashboard.senderStatus.connected"),
      description: t("dashboard.senderStatus.connectedDescription"),
    },
    needsAttention: {
      variant: "warning" as const,
      icon: AlertCircle,
      label: t("dashboard.senderStatus.needsAttention"),
      description: t("dashboard.senderStatus.needsAttentionDescription"),
    },
    notSetUp: {
      variant: "secondary" as const,
      icon: AlertCircle,
      label: t("dashboard.senderStatus.notSetUp"),
      description: t("dashboard.senderStatus.notSetUpDescription"),
    },
  }[senderStatus];
  const SenderStatusIcon = senderStatusConfig.icon;

  if (!user) return <MailerLoginPage />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("dashboard.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
            {t("dashboard.description")}
          </p>
        </div>
        <ButtonLink
          href="/campaigns/new"
          size="md"
          className="min-h-11 w-full sm:w-auto"
          leftIcon={<Plus className="h-4 w-4" />}
        >
          {t("actions.newCampaign")}
        </ButtonLink>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: t("dashboard.kpis.totalCampaigns"),
            display: loading ? "—" : formatNumber(stats.totalCampaigns),
            icon: Mail,
          },
          {
            label: t("dashboard.kpis.emailsSent"),
            display: loading ? "—" : formatNumber(stats.totalSent),
            icon: Send,
          },
          {
            label: t("dashboard.kpis.openRate"),
            display: loading ? "—" : openRate,
            icon: CheckCircle2,
          },
          {
            label: t("dashboard.kpis.clickRate"),
            display: loading ? "—" : clickRate,
            icon: MousePointerClick,
          },
        ].map(({ label, display, icon: Icon }) => (
          <Card
            key={label}
            className="rounded-xl border border-border/80 p-4 shadow-sm sm:p-5"
            hover={false}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="mt-3 text-2xl font-semibold leading-none tracking-tight text-foreground">
                  {display}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/45 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
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
        ].map(({ title, description, href, icon: Icon, primary, action }) => (
          <Card
            key={title}
            className="flex flex-col rounded-xl border border-border/80 p-5 shadow-sm"
            hover={false}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-muted/45 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="mt-4 flex-1">
              <h2 className="text-base font-semibold leading-6">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            <ButtonLink
              href={href}
              variant={primary ? "primary" : "outline"}
              size="sm"
              className="mt-5 min-h-10 w-full justify-between"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {action}
            </ButtonLink>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-xl border border-border/80 p-5 shadow-sm sm:p-6" hover={false}>
          <div className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold leading-7">{t("dashboard.recentActivity")}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("dashboard.recentDescription")}
              </p>
            </div>
            {hasCampaigns && (
              <ButtonLink href="/campaigns" variant="outline" size="sm" className="min-h-10 w-full sm:w-auto">
                {t("dashboard.viewAllCampaigns")}
              </ButtonLink>
            )}
          </div>

          {!hasCampaigns ? (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{t("dashboard.emptyState.title")}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {t("dashboard.emptyState.description")}
              </p>
              <ButtonLink
                href="/campaigns/new"
                size="sm"
                className="mt-5 min-h-10"
                leftIcon={<Plus className="h-4 w-4" />}
              >
                {t("dashboard.emptyState.action")}
              </ButtonLink>
            </div>
          ) : (
            <div className="divide-y divide-border/80">
              {recentCampaigns.slice(0, 6).map((campaign) => {
                const sent = Number(campaign.sentCount ?? 0);
                const opened = Number(campaign.openCount ?? 0);
                const clicked = Number(campaign.clickCount ?? 0);
                const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
                const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
                const isScheduled = campaign.status === "DRAFT" && Boolean(campaign.scheduledAt);
                const statusKey = isScheduled ? "campaigns.status.scheduled" : `campaigns.status.${campaign.status.toLowerCase()}`;

                return (
                  <div key={campaign.id} className="py-4 first:pt-5 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <ButtonLink
                            href={`/campaigns/${campaign.id}`}
                            variant="link"
                            size="sm"
                            className="h-auto min-w-0 justify-start p-0 text-left text-sm font-semibold text-foreground hover:text-primary"
                          >
                            <span className="truncate">{campaign.name}</span>
                          </ButtonLink>
                          <Badge variant={statusBadgeVariant(campaign.status)} size="sm" dot>
                            {t(statusKey)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {t("dashboard.activityLine", {
                            sent,
                            openRate,
                            clickRate,
                          })}
                        </p>
                      </div>
                      <ButtonLink
                        href={`/campaigns/${campaign.id}`}
                        variant="ghost"
                        size="sm"
                        className="min-h-10 w-full sm:w-auto"
                      >
                        {t("dashboard.openCampaign")}
                      </ButtonLink>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="rounded-xl border border-border/80 p-5 shadow-sm" hover={false}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/45 text-primary">
                <SenderStatusIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{t("dashboard.senderStatus.title")}</h2>
                  <Badge variant={senderStatusConfig.variant} size="sm" dot>
                    {loading ? t("dashboard.senderStatus.checking") : senderStatusConfig.label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {loading ? t("dashboard.senderStatus.checkingDescription") : senderStatusConfig.description}
                </p>
                <ButtonLink
                  href="/smtp-pool"
                  variant={senderStatus === "connected" ? "outline" : "primary"}
                  size="sm"
                  className="mt-5 min-h-10 w-full justify-between"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  {t("dashboard.senderStatus.action")}
                </ButtonLink>
              </div>
            </div>
          </Card>

          {!hasContacts && (
            <Card className="rounded-xl border border-border/80 p-5 shadow-sm" hover={false}>
              <h2 className="text-base font-semibold">{t("dashboard.contactsPrompt.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("dashboard.contactsPrompt.description")}
              </p>
              <ButtonLink
                href="/contacts"
                variant="outline"
                size="sm"
                className="mt-5 min-h-10 w-full justify-between"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {t("dashboard.contactsPrompt.action")}
              </ButtonLink>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
