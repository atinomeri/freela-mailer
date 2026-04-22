"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageSpinner } from "@/components/ui/spinner";
import { ConfirmModal } from "@/components/ui/modal";
import {
  ArrowLeft,
  Send,
  Trash2,
  Link2,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  MousePointerClick,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { MailerLoginPage } from "../../login-page";
import { useTranslations } from "next-intl";
import { formatGeorgianDateTime } from "@/lib/date";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  senderName: string | null;
  senderEmail: string | null;
  status: string;
  contactListId: string | null;
  scheduledAt: string | null;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface ContactList {
  id: string;
  name: string;
  contactCount: number;
}

interface TrackingStats {
  total_sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  open_rate: number;
  click_rate: number;
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

interface FailedRecipient {
  email: string;
  reason: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const STATUS_BADGE: Record<
  string,
  { variant: "default" | "success" | "warning" | "destructive" | "secondary"; labelKey: string }
> = {
  DRAFT: { variant: "secondary", labelKey: "campaigns.status.draft" },
  QUEUED: { variant: "default", labelKey: "campaigns.status.queued" },
  SENDING: { variant: "warning", labelKey: "campaigns.status.sending" },
  PAUSED: { variant: "secondary", labelKey: "campaigns.status.paused" },
  COMPLETED: { variant: "success", labelKey: "campaigns.status.completed" },
  FAILED: { variant: "destructive", labelKey: "campaigns.status.failed" },
};

export default function CampaignDetailPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showAssignList, setShowAssignList] = useState(false);
  const [tracking, setTracking] = useState<TrackingStats | null>(null);
  const [failedRecipients, setFailedRecipients] = useState<FailedRecipient[]>([]);
  const [failedPagination, setFailedPagination] = useState<Pagination | null>(null);
  const [failedPage, setFailedPage] = useState(1);
  const [failedLoading, setFailedLoading] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [exportingFailed, setExportingFailed] = useState(false);
  const [retrySuccessCampaignId, setRetrySuccessCampaignId] = useState<string | null>(null);
  const campaignId = campaign?.id ?? null;
  const campaignFailedCount = campaign?.failedCount ?? 0;

  function getApiError(body: ApiErrorShape | null, fallback: string): string {
    const apiError = body?.error;
    if (typeof apiError === "string") return apiError;
    if (typeof apiError?.message === "string") return apiError.message;
    if (typeof body?.message === "string") return body.message;
    return fallback;
  }

  function parseContentDispositionFilename(header: string | null): string | null {
    if (!header) return null;
    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const plainMatch = /filename="?([^"]+)"?/i.exec(header);
    return plainMatch?.[1] ?? null;
  }

  const loadCampaign = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/desktop/campaigns/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.data);
      } else {
        setError(t("campaignDetail.notFound"));
      }
    } catch {
      setError(t("errors.failedToLoadCampaign"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, params.id, t]);

  const loadContactLists = useCallback(async () => {
    try {
      const res = await apiFetch("/api/desktop/contact-lists?limit=100");
      if (res.ok) {
        const data = await res.json();
        setContactLists(data.data);
      }
    } catch {
      // ignore
    }
  }, [apiFetch]);

  const loadTracking = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/tracking/stats?campaign_id=${params.id}`);
      if (res.status === 404) {
        setTracking(null);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTracking(data);
      } else {
        setTracking(null);
      }
    } catch {
      // ignore tracking errors
    }
  }, [apiFetch, params.id]);

  const loadFailedRecipients = useCallback(async () => {
    setFailedLoading(true);
    try {
      const res = await apiFetch(
        `/api/desktop/campaigns/${params.id}/failed?page=${failedPage}&limit=20`,
      );
      if (!res.ok) {
        setFailedRecipients([]);
        setFailedPagination(null);
        return;
      }
      const data = await res.json();
      setFailedRecipients(data.data ?? []);
      const meta = data.meta ?? data.pagination;
      if (meta) {
        setFailedPagination({
          page: Number(meta.page ?? failedPage),
          pageSize: Number(meta.pageSize ?? 20),
          total: Number(meta.total ?? 0),
          hasMore: Boolean(meta.hasMore),
        });
      } else {
        setFailedPagination(null);
      }
    } catch {
      setFailedRecipients([]);
      setFailedPagination(null);
    } finally {
      setFailedLoading(false);
    }
  }, [apiFetch, failedPage, params.id]);

  useEffect(() => {
    if (user) {
      loadCampaign();
      loadContactLists();
      loadTracking();
    }
  }, [user, loadCampaign, loadContactLists, loadTracking]);

  useEffect(() => {
    if (!user) return;
    if (!campaignId || campaignFailedCount <= 0) {
      setFailedRecipients([]);
      setFailedPagination(null);
      return;
    }
    void loadFailedRecipients();
  }, [user, campaignId, campaignFailedCount, failedPage, loadFailedRecipients]);

  useEffect(() => {
    setFailedPage(1);
    setRetrySuccessCampaignId(null);
  }, [campaignId]);

  // Auto-refresh while sending
  useEffect(() => {
    if (campaign?.status !== "SENDING" && campaign?.status !== "QUEUED") return;
    const interval = setInterval(() => {
      void loadCampaign();
      void loadTracking();
    }, 5000);
    return () => clearInterval(interval);
  }, [campaign?.status, loadCampaign, loadTracking]);

  if (!user) return <MailerLoginPage />;

  async function handleAssignList(listId: string) {
    setActionLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/desktop/campaigns/${params.id}/assign-list`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactListId: listId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(getApiError(body, t("errors.assignListFailed")));
      }
      setShowAssignList(false);
      await loadCampaign();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errors.assignListFailed"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSend() {
    setActionLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/desktop/campaigns/${params.id}/send`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(getApiError(body, t("errors.sendCampaignFailed")));
      }
      setShowSendConfirm(false);
      await loadCampaign();
      await loadTracking();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errors.sendCampaignFailed"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/desktop/campaigns/${params.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        router.push("/mailer/campaigns");
      } else {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        setError(getApiError(body, t("errors.deleteCampaignFailed")));
      }
    } catch {
      setError(t("errors.deleteCampaignFailed"));
    } finally {
      setActionLoading(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleExportFailed() {
    setExportingFailed(true);
    setError("");
    try {
      const res = await apiFetch(`/api/desktop/campaigns/${params.id}/failed?format=csv`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(getApiError(body, t("errors.failedRecipientsExportFailed")));
      }

      const blob = await res.blob();
      const filename =
        parseContentDispositionFilename(res.headers.get("content-disposition")) ??
        `failed_${params.id}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("errors.failedRecipientsExportFailed"),
      );
    } finally {
      setExportingFailed(false);
    }
  }

  async function handleRetryFailed() {
    setRetryingFailed(true);
    setError("");
    setRetrySuccessCampaignId(null);
    try {
      const res = await apiFetch(`/api/desktop/campaigns/${params.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createNewList: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(getApiError(body, t("errors.retryFailedRecipientsFailed")));
      }
      const body = (await res.json()) as { data?: { retryCampaign?: { id?: string } } };
      const retryCampaignId = body.data?.retryCampaign?.id;
      if (retryCampaignId) {
        setRetrySuccessCampaignId(retryCampaignId);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("errors.retryFailedRecipientsFailed"),
      );
    } finally {
      setRetryingFailed(false);
    }
  }

  if (loading) return <PageSpinner />;

  if (!campaign) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-muted-foreground">{t("campaignDetail.notFound")}</p>
        <Link href="/mailer/campaigns" className="mt-2 inline-block text-sm text-primary hover:underline">
          {t("actions.backToCampaigns")}
        </Link>
      </div>
    );
  }

  const badge = STATUS_BADGE[campaign.status] ?? STATUS_BADGE.DRAFT;
  const isDraft = campaign.status === "DRAFT";
  const isSending = campaign.status === "SENDING";
  const isQueued = campaign.status === "QUEUED";
  const isActive = isSending || isQueued;
  const isCompleted = campaign.status === "COMPLETED";
  const isFailed = campaign.status === "FAILED";
  const progress =
    campaign.totalCount > 0
      ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.totalCount) * 100)
      : 0;
  const failedTotalPages = failedPagination
    ? Math.max(1, Math.ceil(failedPagination.total / failedPagination.pageSize))
    : 1;
  const topFailedReason = failedRecipients
    .map((item) => (item.reason || "").trim())
    .filter(Boolean)
    .reduce(
      (acc, reason) => {
        const count = (acc.counts.get(reason) ?? 0) + 1;
        acc.counts.set(reason, count);
        if (!acc.topReason || count > acc.topCount) {
          acc.topReason = reason;
          acc.topCount = count;
        }
        return acc;
      },
      {
        counts: new Map<string, number>(),
        topReason: "" as string,
        topCount: 0,
      },
    );
  const failureHint =
    campaign.status === "FAILED"
      ? topFailedReason.topReason
        ? t("campaignDetail.failedStopHintWithReason", {
            reason: topFailedReason.topReason.slice(0, 200),
            count: topFailedReason.topCount,
          })
        : campaign.failedCount > 0
          ? t("campaignDetail.failedStopHint")
          : t("campaignDetail.failedWarmupHint")
      : null;

  const assignedList = contactLists.find((l) => l.id === campaign.contactListId);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href="/mailer/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("actions.backToCampaigns")}
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {failureHint && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {failureHint}
        </div>
      )}

      {/* Header */}
      <Card className="p-6" hover={false}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{campaign.name}</h1>
              <Badge variant={badge.variant} dot>
                {t(badge.labelKey)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{campaign.subject}</p>
            {campaign.scheduledAt && campaign.status === "DRAFT" && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Scheduled: {formatGeorgianDateTime(campaign.scheduledAt)}
              </p>
            )}
            {campaign.senderName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("campaignDetail.fromPrefix")} {campaign.senderName}{" "}
                {campaign.senderEmail && `<${campaign.senderEmail}>`}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {!isDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/mailer/reports?campaignId=${campaign.id}`)}
              >
                <Download className="h-4 w-4" />
                Export report
              </Button>
            )}
            {isDraft && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Contact list assignment */}
      <Card className="mt-4 p-6" hover={false}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t("campaignDetail.contactListTitle")}</h2>
            {assignedList ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {assignedList.name} ({t("contacts.contactsCount", { count: assignedList.contactCount })})
              </p>
            ) : campaign.contactListId ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("campaignDetail.listAssigned")} ({t("contacts.contactsCount", { count: campaign.totalCount })})
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t("campaignDetail.noListAssigned")}</p>
            )}
          </div>
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssignList(!showAssignList)}
            >
              <Link2 className="h-4 w-4" />
              {campaign.contactListId ? t("actions.change") : t("actions.assign")}
            </Button>
          )}
        </div>

        {/* Assign list dropdown */}
        {showAssignList && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {contactLists.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("campaignDetail.contactListsEmpty")}{" "}
                <Link href="/mailer/contacts" className="text-primary hover:underline">
                  {t("contacts.createOneFirst")}
                </Link>
              </p>
            ) : (
              contactLists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => handleAssignList(list.id)}
                  disabled={actionLoading}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="font-medium">{list.name}</span>
                  <span className="text-muted-foreground">{t("contacts.contactsCount", { count: list.contactCount })}</span>
                </button>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Progress (for sending/completed/failed) */}
      {(isActive || isCompleted || isFailed) && (
        <Card className="mt-4 p-6" hover={false}>
          <h2 className="mb-4 text-sm font-semibold">{t("campaignDetail.sendingProgress")}</h2>

          <Progress value={progress} className="mb-3" showLabel />

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-success">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xl font-semibold">{campaign.sentCount}</span>
              </div>
              <div className="text-xs text-muted-foreground">{t("campaignDetail.sent")}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-xl font-semibold">{campaign.failedCount}</span>
              </div>
              <div className="text-xs text-muted-foreground">{t("campaignDetail.failed")}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xl font-semibold">
                  {campaign.totalCount - campaign.sentCount - campaign.failedCount}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{t("campaignDetail.remaining")}</div>
            </div>
          </div>

          {campaign.startedAt && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t("campaignDetail.started")}: {formatGeorgianDateTime(campaign.startedAt)}
            </p>
          )}
          {campaign.completedAt && (
            <p className="text-xs text-muted-foreground">
              {t("campaignDetail.completed")}: {formatGeorgianDateTime(campaign.completedAt)}
            </p>
          )}
        </Card>
      )}

      {/* Campaign activity */}
      {tracking && (
        <Card className="mt-4 p-6" hover={false}>
          <h2 className="mb-2 text-sm font-semibold">{t("campaignDetail.campaignActivity")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("campaignDetail.activitySummary", {
              opens: tracking.opened,
              clicks: tracking.clicked,
              bounces: tracking.bounced,
            })}
          </p>

          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("campaignDetail.opens", { count: tracking.opened })}</div>
              <div className="mt-1 flex items-center gap-1 text-base font-semibold">
                <Eye className="h-4 w-4 text-primary" />
                {tracking.opened}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("campaignDetail.clicks", { count: tracking.clicked })}</div>
              <div className="mt-1 flex items-center gap-1 text-base font-semibold">
                <MousePointerClick className="h-4 w-4 text-primary" />
                {tracking.clicked}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("campaignDetail.bounced")}</div>
              <div className="mt-1 text-base font-semibold text-destructive">
                {tracking.bounced}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("campaignDetail.openRate")}</div>
              <div className="mt-1 flex items-center gap-1 text-base font-semibold">
                <Eye className="h-4 w-4 text-primary" />
                {tracking.open_rate}%
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("campaignDetail.clickRate")}</div>
              <div className="mt-1 flex items-center gap-1 text-base font-semibold">
                <MousePointerClick className="h-4 w-4 text-primary" />
                {tracking.click_rate}%
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">{t("campaignDetail.unsubscribed")}</div>
              <div className="mt-1 text-base font-semibold">{tracking.unsubscribed}</div>
            </div>
          </div>
        </Card>
      )}

      {retrySuccessCampaignId && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {t("campaignDetail.retryCreated")}{" "}
          <Link href={`/mailer/campaigns/${retrySuccessCampaignId}`} className="underline">
            {t("campaignDetail.openRetryCampaign")}
          </Link>
        </div>
      )}

      {campaign.failedCount > 0 && (
        <Card className="mt-4 p-6" hover={false}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("campaignDetail.failedRecipientsTitle")}</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportFailed}
                loading={exportingFailed}
              >
                <Download className="h-4 w-4" />
                {t("actions.exportFailedCsv")}
              </Button>
              <Button size="sm" onClick={handleRetryFailed} loading={retryingFailed}>
                <RotateCcw className="h-4 w-4" />
                {t("actions.retryFailed")}
              </Button>
            </div>
          </div>

          {failedLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : failedRecipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("campaignDetail.noFailedRecipients")}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("campaignDetail.failedEmail")}</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("campaignDetail.failedReason")}</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">{t("campaignDetail.failedAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedRecipients.map((item, index) => (
                      <tr key={`${item.email}-${index}`} className="border-b border-border/50">
                        <td className="py-2 pr-4">{item.email}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{item.reason || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatGeorgianDateTime(item.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {failedPagination && failedTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={failedPage <= 1}
                    onClick={() => setFailedPage((prev) => prev - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t("campaigns.pageInfo", { page: failedPage, pages: failedTotalPages })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={failedPage >= failedTotalPages}
                    onClick={() => setFailedPage((prev) => prev + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Send button */}
      {isDraft && campaign.contactListId && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setShowSendConfirm(true)}>
            <Send className="h-4 w-4" />
            {t("actions.sendCampaign")}
          </Button>
        </div>
      )}

      {/* Confirm modals */}
      <ConfirmModal
        isOpen={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        onConfirm={handleSend}
        title={t("campaignDetail.sendTitle")}
        description={t("campaignDetail.sendDescription", {
          name: campaign.name,
          count: campaign.totalCount,
        })}
        confirmText={t("actions.sendNow")}
        loading={actionLoading}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={t("campaignDetail.deleteTitle")}
        description={t("campaignDetail.deleteDescription")}
        confirmText={t("actions.delete")}
        variant="destructive"
        loading={actionLoading}
      />

    </div>
  );
}
