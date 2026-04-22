"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSpinner } from "@/components/ui/spinner";
import { Plus, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { MailerLoginPage } from "../login-page";
import { useTranslations } from "next-intl";
import { formatGeorgianDate } from "@/lib/date";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, { variant: "default" | "success" | "warning" | "destructive" | "secondary"; labelKey: string }> = {
  DRAFT: { variant: "secondary", labelKey: "campaigns.status.draft" },
  QUEUED: { variant: "default", labelKey: "campaigns.status.queued" },
  SENDING: { variant: "warning", labelKey: "campaigns.status.sending" },
  PAUSED: { variant: "secondary", labelKey: "campaigns.status.paused" },
  COMPLETED: { variant: "success", labelKey: "campaigns.status.completed" },
  FAILED: { variant: "destructive", labelKey: "campaigns.status.failed" },
};

export default function CampaignsPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadCampaigns = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/desktop/campaigns?page=${p}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.data);
        const raw = data.meta ?? data.pagination;
        if (raw) {
          const page = Number(raw.page ?? p);
          const pageSize = Number(raw.pageSize ?? raw.limit ?? 10);
          const total = Number(raw.total ?? 0);
          const hasMore =
            typeof raw.hasMore === "boolean"
              ? raw.hasMore
              : page * pageSize < total;
          setPagination({ page, pageSize, total, hasMore });
        } else {
          setPagination(null);
        }
      }
    } catch {
      // handled by apiFetch
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (user) loadCampaigns(page);
  }, [user, page, loadCampaigns]);

  if (!user) return <MailerLoginPage />;

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("campaigns.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("campaigns.description")}
          </p>
        </div>
        <ButtonLink href="/mailer/campaigns/new" size="sm">
          <Plus className="h-4 w-4" />
          {t("actions.newCampaign")}
        </ButtonLink>
      </div>

      {loading ? (
        <PageSpinner />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-12 w-12" />}
          title={t("campaigns.noCampaignsTitle")}
          description={t("campaigns.noCampaignsDescription")}
          action={{ label: t("actions.newCampaign"), href: "/mailer/campaigns/new" }}
        />
      ) : (
        <>
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const badge = STATUS_BADGE[campaign.status] ?? STATUS_BADGE.DRAFT;

              return (
                <Link key={campaign.id} href={`/mailer/campaigns/${campaign.id}`}>
                  <Card className="p-4 cursor-pointer" clickable>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-medium">{campaign.name}</h3>
                          <Badge variant={badge.variant} size="sm" dot>
                            {t(badge.labelKey)}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {campaign.subject}
                        </p>
                      </div>

                      <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
                        {campaign.status === "COMPLETED" || campaign.status === "SENDING" ? (
                          <div>
                            <span className="text-success">{campaign.sentCount}</span>
                            {" / "}
                            <span>{campaign.totalCount}</span>
                            {campaign.failedCount > 0 && (
                              <span className="text-destructive">
                                {" "}
                                {t("campaigns.failedSuffix", { count: campaign.failedCount })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>{formatGeorgianDate(campaign.createdAt)}</div>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {t("campaigns.pageInfo", { page, pages: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
