"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MailerLoginPage } from "../login-page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { formatGeorgianDateTime } from "@/lib/date";

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

interface PaymentItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  externalPaymentId: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

export default function MailerBillingPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerFilter, setLedgerFilter] = useState("");
  const [ledgerMeta, setLedgerMeta] = useState<Pagination | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentFilter, setPaymentFilter] = useState("");
  const [paymentsMeta, setPaymentsMeta] = useState<Pagination | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const loadBalance = useCallback(async () => {
    const res = await apiFetch("/api/desktop/account/me");
    if (!res.ok) {
      throw new Error(t("errors.billingLoadFailed"));
    }
    const body = (await res.json()) as { balance: number };
    setBalance(Number(body.balance ?? 0));
  }, [apiFetch, t]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(ledgerPage),
        limit: "10",
      });
      if (ledgerFilter) params.set("type", ledgerFilter);

      const res = await apiFetch(`/api/desktop/billing/ledger?${params.toString()}`);
      if (!res.ok) throw new Error(t("errors.billingLedgerLoadFailed"));
      const body = (await res.json()) as {
        data: LedgerEntry[];
        meta?: Pagination;
        pagination?: Pagination;
      };
      setLedger(body.data ?? []);
      const meta = body.meta ?? body.pagination;
      if (meta) {
        setLedgerMeta({
          page: Number(meta.page ?? ledgerPage),
          pageSize: Number(meta.pageSize ?? 10),
          total: Number(meta.total ?? 0),
          hasMore: Boolean(meta.hasMore),
        });
      } else {
        setLedgerMeta(null);
      }
    } finally {
      setLedgerLoading(false);
    }
  }, [apiFetch, ledgerFilter, ledgerPage, t]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(paymentsPage),
        limit: "10",
      });
      if (paymentFilter) params.set("status", paymentFilter);

      const res = await apiFetch(`/api/desktop/billing/payments?${params.toString()}`);
      if (!res.ok) throw new Error(t("errors.billingPaymentsLoadFailed"));
      const body = (await res.json()) as {
        data: PaymentItem[];
        meta?: Pagination;
        pagination?: Pagination;
      };
      setPayments(body.data ?? []);
      const meta = body.meta ?? body.pagination;
      if (meta) {
        setPaymentsMeta({
          page: Number(meta.page ?? paymentsPage),
          pageSize: Number(meta.pageSize ?? 10),
          total: Number(meta.total ?? 0),
          hasMore: Boolean(meta.hasMore),
        });
      } else {
        setPaymentsMeta(null);
      }
    } finally {
      setPaymentsLoading(false);
    }
  }, [apiFetch, paymentFilter, paymentsPage, t]);

  useEffect(() => {
    if (!user) return;
    async function boot() {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadBalance(), loadLedger(), loadPayments()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.billingLoadFailed"));
      } finally {
        setLoading(false);
      }
    }
    void boot();
  }, [user, loadBalance, loadLedger, loadPayments, t]);

  useEffect(() => {
    if (!user || loading) return;
    void loadLedger().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t("errors.billingLedgerLoadFailed"));
    });
  }, [user, loading, loadLedger, t]);

  useEffect(() => {
    if (!user || loading) return;
    void loadPayments().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t("errors.billingPaymentsLoadFailed"));
    });
  }, [user, loading, loadPayments, t]);

  if (!user) return <MailerLoginPage />;
  if (loading) return <PageSpinner />;

  function amountVariant(value: number) {
    if (value > 0) return "success" as const;
    if (value < 0) return "destructive" as const;
    return "secondary" as const;
  }

  function paymentVariant(status: string) {
    if (status === "SUCCEEDED") return "success" as const;
    if (status === "PENDING") return "warning" as const;
    if (status === "FAILED" || status === "CANCELED") return "destructive" as const;
    return "secondary" as const;
  }

  function getApiError(body: ApiErrorShape | null, fallback: string): string {
    const apiError = body?.error;
    if (typeof apiError === "string") return apiError;
    if (typeof apiError?.message === "string") return apiError.message;
    if (typeof body?.message === "string") return body.message;
    return fallback;
  }

  async function refreshAll() {
    setError("");
    try {
      await Promise.all([loadBalance(), loadLedger(), loadPayments()]);
    } catch (err) {
      if (err instanceof Error) {
        setError(getApiError({ message: err.message }, t("errors.billingLoadFailed")));
      } else {
        setError(t("errors.billingLoadFailed"));
      }
    }
  }

  const ledgerPages = ledgerMeta
    ? Math.max(1, Math.ceil(ledgerMeta.total / ledgerMeta.pageSize))
    : 1;
  const paymentPages = paymentsMeta
    ? Math.max(1, Math.ceil(paymentsMeta.total / paymentsMeta.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("billing.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing.description")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          {t("actions.refresh")}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="mb-4 p-6" hover={false}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("billing.currentBalance")}</p>
            <p className="text-2xl font-semibold">
              {balance ?? 0} {t("billing.currency")}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-6" hover={false}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("billing.ledgerTitle")}</h2>
            <select
              value={ledgerFilter}
              onChange={(e) => {
                setLedgerPage(1);
                setLedgerFilter(e.target.value);
              }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="">{t("billing.allTypes")}</option>
              <option value="QUOTA_RESERVE">QUOTA_RESERVE</option>
              <option value="QUOTA_REFUND">QUOTA_REFUND</option>
              <option value="PAYMENT_CAPTURE">PAYMENT_CAPTURE</option>
              <option value="PAYMENT_REFUND">PAYMENT_REFUND</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
            </select>
          </div>

          {ledgerLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("billing.ledgerEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {ledger.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium">{entry.type}</p>
                    <Badge variant={amountVariant(entry.amount)} size="sm">
                      {entry.amount > 0 ? "+" : ""}
                      {entry.amount}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.description || t("billing.noDescription")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("billing.balanceLine", {
                      before: entry.balanceBefore,
                      after: entry.balanceAfter,
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatGeorgianDateTime(entry.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {ledgerMeta && ledgerPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={ledgerPage <= 1}
                onClick={() => setLedgerPage((prev) => prev - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("campaigns.pageInfo", { page: ledgerPage, pages: ledgerPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={ledgerPage >= ledgerPages}
                onClick={() => setLedgerPage((prev) => prev + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-6" hover={false}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("billing.paymentsTitle")}</h2>
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentsPage(1);
                setPaymentFilter(e.target.value);
              }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="">{t("billing.allStatuses")}</option>
              <option value="PENDING">PENDING</option>
              <option value="SUCCEEDED">SUCCEEDED</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>

          {paymentsLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("billing.paymentsEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium">{payment.provider}</p>
                    <Badge variant={paymentVariant(payment.status)} size="sm">
                      {payment.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("billing.paymentAmount", {
                      amount: payment.amount,
                      currency: payment.currency,
                    })}
                  </p>
                  {payment.externalPaymentId && (
                    <p className="mt-0.5 break-all text-xs text-muted-foreground">
                      {payment.externalPaymentId}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatGeorgianDateTime(payment.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {paymentsMeta && paymentPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={paymentsPage <= 1}
                onClick={() => setPaymentsPage((prev) => prev - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("campaigns.pageInfo", { page: paymentsPage, pages: paymentPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paymentsPage >= paymentPages}
                onClick={() => setPaymentsPage((prev) => prev + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
