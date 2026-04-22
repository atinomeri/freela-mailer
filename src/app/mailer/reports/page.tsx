"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSpinner } from "@/components/ui/spinner";
import { MailerLoginPage } from "../login-page";
import { Download, ChevronLeft, ChevronRight, Mail, MousePointerClick, Eye } from "lucide-react";
import { formatGeorgianDateTime } from "@/lib/date";

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

const SECTION_LABEL: Record<Section, string> = {
  SENT: "Sent",
  OPENED: "Opened",
  CLICKED: "Clicked",
};

export default function MailerReportsPage() {
  const { user, apiFetch } = useMailerAuth();
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
      if (!res.ok) throw new Error("Failed to load reports");
      const body = (await res.json()) as ReportsResponse;
      const meta = body.meta ?? body.pagination ?? null;
      setRows(body.data.rows ?? []);
      setTotals(body.data.totals ?? { sent: 0, opened: 0, clicked: 0 });
      setPagination(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, section, page, campaignFilter, dateFromFilter, dateToFilter]);

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
      if (!res.ok) throw new Error("Export failed");
      const body = (await res.json()) as ExportResponse;
      const data = body.data;

      if (data.mode === "direct" && data.downloadUrl) {
        window.location.href = data.downloadUrl;
        setExportInfo("Download file");
        setExportDownloadUrl(data.downloadUrl);
      } else {
        setExportInfo("Preparing export...");
        const poll = async () => {
          const statusRes = await apiFetch(data.statusUrl);
          if (!statusRes.ok) return;
          const statusBody = (await statusRes.json()) as ExportJobStatusResponse;
          const status = statusBody.data.status;
          if (status === "COMPLETED" && statusBody.data.downloadUrl) {
            setExportInfo("Download file");
            setExportDownloadUrl(statusBody.data.downloadUrl);
            return;
          }
          if (status === "FAILED") {
            setError(statusBody.data.error || "Export failed");
            return;
          }
          setTimeout(() => void poll(), 2000);
        };
        setTimeout(() => void poll(), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sent, opened, and clicked activity with quick export.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4" hover={false}>
          <div className="text-xs text-muted-foreground">Sent</div>
          <div className="mt-2 flex items-center gap-2 text-2xl font-semibold">
            <Mail className="h-5 w-5 text-primary" />
            {totals.sent}
          </div>
        </Card>
        <Card className="p-4" hover={false}>
          <div className="text-xs text-muted-foreground">Opened</div>
          <div className="mt-2 flex items-center gap-2 text-2xl font-semibold">
            <Eye className="h-5 w-5 text-primary" />
            {totals.opened}
          </div>
        </Card>
        <Card className="p-4" hover={false}>
          <div className="text-xs text-muted-foreground">Clicked</div>
          <div className="mt-2 flex items-center gap-2 text-2xl font-semibold">
            <MousePointerClick className="h-5 w-5 text-primary" />
            {totals.clicked}
          </div>
        </Card>
      </div>

      <Card className="mb-4 p-4" hover={false}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span className="font-medium">Campaign</span>
            <select
              value={campaignFilter}
              onChange={(e) => {
                setCampaignFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All campaigns</option>
              {campaignOptions.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">From</span>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => {
                setDateFromFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">To</span>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => {
                setDateToFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>

          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setCampaignFilter("");
                setDateFromFilter("");
                setDateToFilter("");
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>

          <div className="flex items-end">
            <Button onClick={() => void loadReports()}>Apply</Button>
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-4" hover={false}>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Export section</span>
            <select
              value={exportSection}
              onChange={(e) => setExportSection(e.target.value as ExportSection)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="SENT">Sent</option>
              <option value="OPENED">Opened</option>
              <option value="CLICKED">Clicked</option>
              <option value="ALL">All activity</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Format</span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="CSV">CSV</option>
              <option value="XLSX">Excel (.xlsx)</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button onClick={handleExport} loading={exporting}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
          <div className="flex items-end gap-2 text-sm text-muted-foreground">
            <span>{exportInfo}</span>
            {exportDownloadUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = exportDownloadUrl;
                }}
              >
                Download file
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4" hover={false}>
        <div className="mb-3 flex items-center gap-2">
          {(Object.keys(SECTION_LABEL) as Section[]).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={section === item ? "primary" : "outline"}
              onClick={() => {
                setSection(item);
                setPage(1);
              }}
            >
              {SECTION_LABEL[item]}
            </Button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <PageSpinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No activity found" description="Try changing filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Email</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Campaign</th>
                  {section === "SENT" && (
                    <>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Sender</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Sent at</th>
                    </>
                  )}
                  {section === "OPENED" && (
                    <>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">First opened</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Opens count</th>
                    </>
                  )}
                  {section === "CLICKED" && (
                    <>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Clicked at</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Link</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {section === "SENT" &&
                  (rows as SentRow[]).map((row, index) => (
                    <tr key={`${row.email}-${row.sentAt}-${index}`} className="border-b border-border/50">
                      <td className="py-2 pr-4">{row.email}</td>
                      <td className="py-2 pr-4">{row.campaign}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.sender || "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatGeorgianDateTime(row.sentAt)}</td>
                    </tr>
                  ))}
                {section === "OPENED" &&
                  (rows as OpenedRow[]).map((row, index) => (
                    <tr key={`${row.email}-${row.firstOpenedAt}-${index}`} className="border-b border-border/50">
                      <td className="py-2 pr-4">{row.email}</td>
                      <td className="py-2 pr-4">{row.campaign}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatGeorgianDateTime(row.firstOpenedAt)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.opensCount}</td>
                    </tr>
                  ))}
                {section === "CLICKED" &&
                  (rows as ClickedRow[]).map((row, index) => (
                    <tr key={`${row.email}-${row.clickedAt}-${index}`} className="border-b border-border/50">
                      <td className="py-2 pr-4">{row.email}</td>
                      <td className="py-2 pr-4">{row.campaign}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatGeorgianDateTime(row.clickedAt)}</td>
                      <td className="max-w-[320px] truncate py-2 pr-4 text-muted-foreground">{row.link || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => prev - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
