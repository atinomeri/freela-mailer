"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { MetricCard } from "@/components/ui/metric-card";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSpinner } from "@/components/ui/spinner";
import { MailerLoginPage } from "../login-page";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Mail,
  MousePointerClick,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatGeorgianDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

type Section = "SENT" | "OPENED" | "CLICKED";
type ExportSection = Section | "ALL";
type ExportFormat = "CSV" | "XLSX";

interface CampaignOption {
  id: string;
  name: string;
}

interface Totals {
  sent: number;
  opened: number;
  clicked: number;
}

interface SentRow {
  email: string;
  campaignId: string;
  campaign: string;
  sender: string | null;
  sentAt: string;
}

interface OpenedRow {
  email: string;
  campaignId: string;
  campaign: string;
  firstOpenedAt: string;
  opensCount: number;
}

interface ClickedRow {
  email: string;
  campaignId: string;
  campaign: string;
  clickedAt: string;
  link: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface ReportsResponse {
  data: {
    section: Section;
    totals: Totals;
    rows: SentRow[] | OpenedRow[] | ClickedRow[];
  };
  meta?: Pagination;
  pagination?: Pagination;
}

interface ExportResponse {
  data: {
    mode: "direct" | "background";
    jobId: string;
    statusUrl: string;
    downloadUrl?: string;
  };
}

interface ExportJobStatusResponse {
  data: {
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    error?: string | null;
    downloadUrl?: string | null;
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export default function MailerReportsPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.reports");
  const searchParams = useSearchParams();
  const initialCampaign = searchParams.get("campaignId") || "";

  const [section, setSection] = useState<Section>("SENT");
  const [rows, setRows] = useState<SentRow[] | OpenedRow[] | ClickedRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ sent: 0, opened: 0, clicked: 0 });
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [campaignFilter, setCampaignFilter] = useState(initialCampaign);
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [exportSection, setExportSection] = useState<ExportSection>("ALL");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("CSV");
  const [exporting, setExporting] = useState(false);
  const [exportInfo, setExportInfo] = useState("");
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);

  const totalPages = useMemo(
    () => (pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1),
    [pagination],
  );

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("section", section);
      params.set("page", String(page));
      params.set("limit", "20");
      if (campaignFilter) params.set("campaignId", campaignFilter);
      if (dateFromFilter) params.set("dateFrom", dateFromFilter);
      if (dateToFilter) params.set("dateTo", dateToFilter);

      const res = await apiFetch(`/api/desktop/reports?${params.toString()}`);
      if (!res.ok) throw new Error(t("loadFailed"));
      const body = (await res.json()) as ReportsResponse;
      const meta = body.meta ?? body.pagination ?? null;
      setRows(body.data.rows ?? []);
      setTotals(body.data.totals ?? { sent: 0, opened: 0, clicked: 0 });
      setPagination(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, section, page, campaignFilter, dateFromFilter, dateToFilter, t]);

  useEffect(() => {
    if (!user) return;
    void loadReports();
  }, [user, loadReports]);

  useEffect(() => {
    if (!user) return;
    async function loadCampaignOptions() {
      try {
        const res = await apiFetch("/api/desktop/campaigns?page=1&limit=100");
        if (!res.ok) return;
        const body = (await res.json()) as { data?: CampaignOption[] };
        setCampaignOptions(body.data ?? []);
      } catch {
        // ignore options load failures
      }
    }
    void loadCampaignOptions();
  }, [apiFetch, user]);

  if (!user) return <MailerLoginPage />;

  async function handleExport() {
    setExporting(true);
    setError("");
    setExportInfo("");
    setExportDownloadUrl(null);
    try {
      const res = await apiFetch("/api/desktop/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: exportSection,
          format: exportFormat,
          campaignId: campaignFilter || undefined,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
        }),
      });
      if (!res.ok) throw new Error(t("exportFailed"));
      const body = (await res.json()) as ExportResponse;
      const data = body.data;

      if (data.mode === "direct" && data.downloadUrl) {
        window.location.href = data.downloadUrl;
        setExportInfo(t("downloadFile"));
        setExportDownloadUrl(data.downloadUrl);
      } else {
        setExportInfo(t("preparingExport"));
        const poll = async () => {
          const statusRes = await apiFetch(data.statusUrl);
          if (!statusRes.ok) return;
          const statusBody = (await statusRes.json()) as ExportJobStatusResponse;
          const status = statusBody.data.status;
          if (status === "COMPLETED" && statusBody.data.downloadUrl) {
            setExportInfo(t("downloadFile"));
            setExportDownloadUrl(statusBody.data.downloadUrl);
            return;
          }
          if (status === "FAILED") {
            setError(statusBody.data.error || t("exportFailed"));
            return;
          }
          setTimeout(() => void poll(), 2000);
        };
        setTimeout(() => void poll(), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  function resetFilters() {
    setCampaignFilter("");
    setDateFromFilter("");
    setDateToFilter("");
    setPage(1);
  }

  const hasFilters = campaignFilter !== "" || dateFromFilter !== "" || dateToFilter !== "";
  const hasAnyTotals = totals.sent + totals.opened + totals.clicked > 0;

  const selectClass = cn(
    "h-11 w-full rounded-lg border border-border/80 bg-background/80 px-3 text-sm",
    "outline-none transition-colors hover:border-border",
    "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            size="md"
            onClick={() => void handleExport()}
            loading={exporting}
            leftIcon={<Download className="h-4 w-4" />}
          >
            {t("exportAction")}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label={t("summary.sent")}
          value={loading ? "—" : formatNumber(totals.sent)}
          icon={<Mail className="h-4 w-4" strokeWidth={2.2} />}
          tone="primary"
        />
        <MetricCard
          label={t("summary.opened")}
          value={loading ? "—" : formatNumber(totals.opened)}
          icon={<Eye className="h-4 w-4" strokeWidth={2.2} />}
          tone="success"
        />
        <MetricCard
          label={t("summary.clicked")}
          value={loading ? "—" : formatNumber(totals.clicked)}
          icon={<MousePointerClick className="h-4 w-4" strokeWidth={2.2} />}
          tone="accent"
        />
      </div>

      {/* Filters + Export controls */}
      <SectionCard
        title={t("filtersTitle")}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={exportSection}
              onChange={(e) => setExportSection(e.target.value as ExportSection)}
              className={cn(selectClass, "h-9 w-auto text-[12.5px]")}
              aria-label={t("exportSectionLabel")}
            >
              <option value="SENT">{t("tabs.sent")}</option>
              <option value="OPENED">{t("tabs.opened")}</option>
              <option value="CLICKED">{t("tabs.clicked")}</option>
              <option value="ALL">{t("exportSectionAll")}</option>
            </select>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className={cn(selectClass, "h-9 w-auto text-[12.5px]")}
              aria-label={t("exportFormatLabel")}
            >
              <option value="CSV">CSV</option>
              <option value="XLSX">Excel (.xlsx)</option>
            </select>
            {exportDownloadUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.href = exportDownloadUrl;
                }}
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                {t("downloadFile")}
              </Button>
            )}
            {exportInfo && !exportDownloadUrl && (
              <span className="text-[12.5px] text-muted-foreground">{exportInfo}</span>
            )}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("campaignFilterLabel")}</span>
            <select
              value={campaignFilter}
              onChange={(e) => {
                setCampaignFilter(e.target.value);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="">{t("allCampaigns")}</option>
              {campaignOptions.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("fromLabel")}</span>
            <Input
              type="date"
              value={dateFromFilter}
              onChange={(e) => {
                setDateFromFilter(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("toLabel")}</span>
            <Input
              type="date"
              value={dateToFilter}
              onChange={(e) => {
                setDateToFilter(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button onClick={() => void loadReports()} size="md" className="min-h-11 flex-1">
              {t("applyFilters")}
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="md" onClick={resetFilters} className="min-h-11">
                {t("resetFilters")}
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Activity table */}
      <SectionCard padded={false}>
        {/* Tabs */}
        <div className="border-b border-border/70">
          <Toolbar bare className="px-5 py-2.5 sm:px-6">
            {(["SENT", "OPENED", "CLICKED"] as Section[]).map((item) => {
              const active = section === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setSection(item);
                    setPage(1);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {t(`tabs.${item.toLowerCase()}`)}
                </button>
              );
            })}
          </Toolbar>
        </div>

        {loading ? (
          <div className="p-8">
            <PageSpinner />
          </div>
        ) : !hasAnyTotals && rows.length === 0 && !hasFilters ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon={<Mail strokeWidth={1.8} />}
              title={t("noActivityTitle")}
              description={t("noActivityDescription")}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon={<Search strokeWidth={1.8} />}
              title={t("noResultsTitle")}
              description={t("noResultsDescription")}
              action={hasFilters ? { label: t("resetFilters"), onClick: resetFilters } : undefined}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border/60 bg-[hsl(var(--muted)/0.45)] text-left text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-6 py-2.5">{t("columns.email")}</th>
                    <th className="px-3 py-2.5">{t("columns.campaign")}</th>
                    {section === "SENT" && (
                      <>
                        <th className="px-3 py-2.5">{t("columns.sender")}</th>
                        <th className="px-3 py-2.5 text-right">{t("columns.sentAt")}</th>
                      </>
                    )}
                    {section === "OPENED" && (
                      <>
                        <th className="px-3 py-2.5">{t("columns.firstOpened")}</th>
                        <th className="px-3 py-2.5 text-right tabular-nums">{t("columns.opensCount")}</th>
                      </>
                    )}
                    {section === "CLICKED" && (
                      <>
                        <th className="px-3 py-2.5">{t("columns.clickedAt")}</th>
                        <th className="px-3 py-2.5">{t("columns.link")}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {section === "SENT" &&
                    (rows as SentRow[]).map((row, index) => (
                      <tr
                        key={`${row.email}-${row.sentAt}-${index}`}
                        className="transition-colors hover:bg-[hsl(var(--muted)/0.5)]"
                      >
                        <td className="px-6 py-3 font-medium text-foreground">{row.email}</td>
                        <td className="px-3 py-3 text-foreground">{row.campaign}</td>
                        <td className="px-3 py-3 text-muted-foreground">{row.sender || "—"}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground">
                          {formatGeorgianDateTime(row.sentAt)}
                        </td>
                      </tr>
                    ))}
                  {section === "OPENED" &&
                    (rows as OpenedRow[]).map((row, index) => (
                      <tr
                        key={`${row.email}-${row.firstOpenedAt}-${index}`}
                        className="transition-colors hover:bg-[hsl(var(--muted)/0.5)]"
                      >
                        <td className="px-6 py-3 font-medium text-foreground">{row.email}</td>
                        <td className="px-3 py-3 text-foreground">{row.campaign}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatGeorgianDateTime(row.firstOpenedAt)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-foreground">
                          {row.opensCount}
                        </td>
                      </tr>
                    ))}
                  {section === "CLICKED" &&
                    (rows as ClickedRow[]).map((row, index) => (
                      <tr
                        key={`${row.email}-${row.clickedAt}-${index}`}
                        className="transition-colors hover:bg-[hsl(var(--muted)/0.5)]"
                      >
                        <td className="px-6 py-3 font-medium text-foreground">{row.email}</td>
                        <td className="px-3 py-3 text-foreground">{row.campaign}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatGeorgianDateTime(row.clickedAt)}
                        </td>
                        <td className="max-w-[320px] truncate px-3 py-3 text-muted-foreground">
                          {row.link || "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {pagination && totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-[hsl(var(--muted)/0.35)] px-5 py-3 sm:px-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => prev - 1)}
                  aria-label="Previous page"
                  className="min-h-9 px-3"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[6rem] text-center text-[13px] tabular-nums text-muted-foreground">
                  {t("pageInfo", { page, pages: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                  aria-label="Next page"
                  className="min-h-9 px-3"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
