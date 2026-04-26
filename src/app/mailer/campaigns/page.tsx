"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  StatusPill,
  type CampaignStatus,
} from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { PageSpinner } from "@/components/ui/spinner";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  Search,
} from "lucide-react";
import { MailerLoginPage } from "../login-page";
import { useTranslations } from "next-intl";
import { formatGeorgianDate } from "@/lib/date";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: "DRAFT" | "QUEUED" | "SENDING" | "PAUSED" | "COMPLETED" | "FAILED";
  scheduledAt?: string | null;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  openCount?: number;
  clickCount?: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 25;
const STATUS_FILTER_OPTIONS: CampaignStatus[] = [
  "draft",
  "ready",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "paused",
];

function toCampaignStatus(
  raw: Campaign["status"],
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

function rate(numerator: number | undefined, denominator: number): string {
  if (!denominator || denominator <= 0) return "—";
  if (numerator === undefined) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function CampaignsPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");

  const loadCampaigns = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await apiFetch(
          `/api/desktop/campaigns?page=${p}&limit=${PAGE_SIZE}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setCampaigns(data.data ?? []);
        const raw = data.meta ?? data.pagination;
        if (raw) {
          const respPage = Number(raw.page ?? p);
          const pageSize = Number(raw.pageSize ?? raw.limit ?? PAGE_SIZE);
          const total = Number(raw.total ?? 0);
          const hasMore =
            typeof raw.hasMore === "boolean"
              ? raw.hasMore
              : respPage * pageSize < total;
          setPagination({ page: respPage, pageSize, total, hasMore });
        } else {
          setPagination(null);
        }
      } catch {
        // handled by apiFetch
      } finally {
        setLoading(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    if (user) void loadCampaigns(page);
  }, [user, page, loadCampaigns]);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      const status = toCampaignStatus(c.status, c.scheduledAt);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (q) {
        const inName = c.name.toLowerCase().includes(q);
        const inSubject = (c.subject ?? "").toLowerCase().includes(q);
        if (!inName && !inSubject) return false;
      }
      return true;
    });
  }, [campaigns, search, statusFilter]);

  if (!user) return <MailerLoginPage />;

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;
  const hasFilters = search.trim() !== "" || statusFilter !== "all";
  const hasCampaignsOnServer = (pagination?.total ?? campaigns.length) > 0;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  const primaryCta = (
    <ButtonLink
      href="/campaigns/new"
      size="md"
      leftIcon={<Plus className="h-4 w-4" />}
    >
      {t("actions.newCampaign")}
    </ButtonLink>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      <PageHeader
        title={t("campaigns.title")}
        description={t("campaigns.description")}
        actions={primaryCta}
      />

      {/* Toolbar — only show when there are campaigns to filter */}
      {hasCampaignsOnServer && (
        <Toolbar>
          <div className="relative w-full sm:max-w-xs">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("campaigns.searchPlaceholder")}
              className="pl-10"
              aria-label={t("campaigns.searchPlaceholder")}
            />
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label
              htmlFor="campaigns-status-filter"
              className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
            >
              {t("campaigns.statusFilterLabel")}
            </label>
            <select
              id="campaigns-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | CampaignStatus)
              }
              className={cn(
                "h-11 min-w-[10rem] rounded-lg border border-border/80 bg-background/80 px-3 text-sm",
                "outline-none transition-colors hover:border-border",
                "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
              )}
            >
              <option value="all">{t("campaigns.allStatuses")}</option>
              {STATUS_FILTER_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {t(`campaigns.status.${status}`)}
                </option>
              ))}
            </select>
          </div>

          <ToolbarSpacer />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="self-start sm:self-auto"
            >
              {t("actions.resetFilters")}
            </Button>
          )}
        </Toolbar>
      )}

      {/* Body — loading / empty / no-results / table */}
      {loading && campaigns.length === 0 ? (
        <SectionCard padded>
          <PageSpinner />
        </SectionCard>
      ) : !hasCampaignsOnServer ? (
        <SectionCard padded={false} bodyClassName="p-5 sm:p-6">
          <EmptyState
            icon={<Mail strokeWidth={1.8} />}
            title={t("campaigns.noCampaignsTitle")}
            description={t("campaigns.noCampaignsDescription")}
            action={{
              label: t("actions.newCampaign"),
              href: "/campaigns/new",
            }}
          />
        </SectionCard>
      ) : filteredCampaigns.length === 0 ? (
        <SectionCard padded={false} bodyClassName="p-5 sm:p-6">
          <EmptyState
            icon={<Search strokeWidth={1.8} />}
            title={t("campaigns.noResultsTitle")}
            description={t("campaigns.noResultsDescription")}
            action={{
              label: t("actions.resetFilters"),
              onClick: resetFilters,
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard padded={false}>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-[hsl(var(--muted)/0.45)] text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-6 py-2.5 text-left">
                    {t("campaigns.columns.name")}
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    {t("campaigns.columns.status")}
                  </th>
                  <th className="px-3 py-2.5 text-right tabular-nums">
                    {t("campaigns.columns.recipients")}
                  </th>
                  <th className="px-3 py-2.5 text-right tabular-nums">
                    {t("campaigns.columns.sent")}
                  </th>
                  <th className="px-3 py-2.5 text-right tabular-nums">
                    {t("campaigns.columns.openRate")}
                  </th>
                  <th className="px-3 py-2.5 text-right tabular-nums">
                    {t("campaigns.columns.clickRate")}
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    {t("campaigns.columns.date")}
                  </th>
                  <th className="px-6 py-2.5 text-right" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCampaigns.map((campaign) => {
                  const status = toCampaignStatus(
                    campaign.status,
                    campaign.scheduledAt,
                  );
                  return (
                    <tr
                      key={campaign.id}
                      className="group transition-colors duration-200 hover:bg-[hsl(var(--muted)/0.5)]"
                    >
                      <td className="min-w-0 max-w-[1px] px-6 py-3.5 align-top">
                        <ButtonLink
                          href={`/campaigns/${campaign.id}`}
                          variant="link"
                          size="sm"
                          className="h-auto min-w-0 max-w-full justify-start truncate p-0 text-left text-[14px] font-medium leading-5 text-foreground hover:text-primary"
                        >
                          <span className="truncate">{campaign.name}</span>
                        </ButtonLink>
                        {campaign.subject && (
                          <p className="mt-0.5 truncate text-[12.5px] leading-5 text-muted-foreground">
                            {campaign.subject}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <StatusPill
                          kind="campaign"
                          status={status}
                          label={t(`campaigns.status.${status}`)}
                        />
                      </td>
                      <td className="px-3 py-3.5 text-right align-top text-[13.5px] tabular-nums text-foreground">
                        {formatNumber(campaign.totalCount)}
                      </td>
                      <td className="px-3 py-3.5 text-right align-top text-[13.5px] tabular-nums text-foreground">
                        {formatNumber(campaign.sentCount)}
                        {campaign.failedCount > 0 && (
                          <div className="text-[11.5px] font-medium text-destructive/85">
                            {t("campaigns.failedSuffix", {
                              count: campaign.failedCount,
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right align-top text-[13.5px] tabular-nums text-muted-foreground">
                        {rate(campaign.openCount, campaign.sentCount)}
                      </td>
                      <td className="px-3 py-3.5 text-right align-top text-[13.5px] tabular-nums text-muted-foreground">
                        {rate(campaign.clickCount, campaign.sentCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right align-top text-[13px] text-muted-foreground">
                        {formatGeorgianDate(campaign.createdAt)}
                      </td>
                      <td className="px-6 py-3.5 text-right align-top">
                        <ButtonLink
                          href={`/campaigns/${campaign.id}`}
                          variant="ghost"
                          size="sm"
                          className="min-h-9 px-3 text-[13px] text-muted-foreground hover:text-foreground"
                          rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                        >
                          {t("campaigns.openCampaign")}
                        </ButtonLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border/60 md:hidden">
            {filteredCampaigns.map((campaign) => {
              const status = toCampaignStatus(
                campaign.status,
                campaign.scheduledAt,
              );
              return (
                <div key={campaign.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <ButtonLink
                        href={`/campaigns/${campaign.id}`}
                        variant="link"
                        size="sm"
                        className="h-auto min-w-0 justify-start p-0 text-left text-[14.5px] font-medium leading-5 text-foreground hover:text-primary"
                      >
                        <span className="truncate">{campaign.name}</span>
                      </ButtonLink>
                      {campaign.subject && (
                        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                          {campaign.subject}
                        </p>
                      )}
                    </div>
                    <StatusPill
                      kind="campaign"
                      status={status}
                      label={t(`campaigns.status.${status}`)}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                    <div>
                      <dt className="text-muted-foreground">
                        {t("campaigns.columns.recipients")}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {formatNumber(campaign.totalCount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("campaigns.columns.sent")}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {formatNumber(campaign.sentCount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("campaigns.columns.openRate")}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {rate(campaign.openCount, campaign.sentCount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("campaigns.columns.clickRate")}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {rate(campaign.clickCount, campaign.sentCount)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>{formatGeorgianDate(campaign.createdAt)}</span>
                    <ButtonLink
                      href={`/campaigns/${campaign.id}`}
                      variant="ghost"
                      size="sm"
                      className="min-h-9 px-3 text-[13px]"
                      rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                    >
                      {t("campaigns.openCampaign")}
                    </ButtonLink>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-[hsl(var(--muted)/0.35)] px-5 py-3 sm:px-6">
              <span className="text-[12.5px] text-muted-foreground tabular-nums">
                {t("campaigns.showingCount", { count: pagination.total })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                  className="min-h-9 px-3"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[3.5rem] text-center text-[13px] tabular-nums text-muted-foreground">
                  {t("campaigns.pageInfo", { page, pages: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className="min-h-9 px-3"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
