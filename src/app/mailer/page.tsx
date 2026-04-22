"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Mail, Users, Send, Eye, MousePointerClick } from "lucide-react";
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

function statusBadgeVariant(status: CampaignItem["status"]): "default" | "success" | "warning" | "destructive" | "secondary" {
  if (status === "COMPLETED") return "success";
  if (status === "SENDING" || status === "QUEUED") return "warning";
  if (status === "FAILED") return "destructive";
  if (status === "DRAFT" || status === "PAUSED") return "secondary";
  return "default";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function loadDashboard() {
      try {
        const [campaignsRes, trackingRes] = await Promise.all([
          apiFetch("/api/desktop/campaigns?page=1&limit=10"),
          apiFetch("/api/tracking/stats"),
        ]);

        const campaignsBody = campaignsRes.ok
          ? (await campaignsRes.json()) as { data?: CampaignItem[]; meta?: PaginationMeta; pagination?: PaginationMeta }
          : null;

        const trackingBody = trackingRes.ok
          ? (await trackingRes.json()) as TrackingStatsResponse
          : null;

        const loadTotalContacts = async (): Promise<number> => {
          const pageSize = 200;
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

  if (!user) return <MailerLoginPage />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.welcomeBack", { email: user.email })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-5" hover={false}>
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <div className="text-xl font-semibold">{loading ? "—" : stats.totalCampaigns}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.campaigns")}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5" hover={false}>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-success" />
            <div>
              <div className="text-xl font-semibold">{loading ? "—" : stats.totalContacts}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.totalContacts")}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5" hover={false}>
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-warning" />
            <div>
              <div className="text-xl font-semibold">{loading ? "—" : stats.totalSent}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.totalSent")}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5" hover={false}>
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-primary" />
            <div>
              <div className="text-xl font-semibold">{loading ? "—" : stats.totalOpened}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.totalOpened")}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5" hover={false}>
          <div className="flex items-center gap-3">
            <MousePointerClick className="h-5 w-5 text-primary" />
            <div>
              <div className="text-xl font-semibold">{loading ? "—" : stats.totalClicked}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.totalClicked")}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6" hover={false}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("dashboard.recentActivity")}</h2>
          <ButtonLink href="/mailer/campaigns" variant="outline" size="sm">
            {t("dashboard.viewAllCampaigns")}
          </ButtonLink>
        </div>

        {!hasCampaigns ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {t("dashboard.emptyCampaigns")}
          </div>
        ) : (
          <div className="space-y-3">
            {recentCampaigns.slice(0, 10).map((campaign) => {
              const sent = Number(campaign.sentCount ?? 0);
              const opened = Number(campaign.openCount ?? 0);
              const clicked = Number(campaign.clickCount ?? 0);
              const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
              const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
              const isScheduled = campaign.status === "DRAFT" && Boolean(campaign.scheduledAt);
              const statusKey = isScheduled ? "campaigns.status.scheduled" : `campaigns.status.${campaign.status.toLowerCase()}`;

              return (
                <div key={campaign.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ButtonLink href={`/mailer/campaigns/${campaign.id}`} variant="ghost" size="sm">
                          {campaign.name}
                        </ButtonLink>
                        <Badge variant={statusBadgeVariant(campaign.status)} size="sm">
                          {t(statusKey as any)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("dashboard.activityLine", {
                          sent,
                          openRate,
                          clickRate,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!hasContacts && (
        <Card className="mt-4 p-5" hover={false}>
          <p className="text-sm text-muted-foreground">{t("dashboard.emptyContacts")}</p>
          <div className="mt-3">
            <ButtonLink href="/mailer/contacts" size="sm">
              {t("actions.manageContacts")}
            </ButtonLink>
          </div>
        </Card>
      )}
    </div>
  );
}
