"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useMailerAuth } from "@/lib/mailer-auth";

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  externalPaymentId: string | null;
  processedByAdminId: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; email: string };
}

interface PaymentsResponse {
  ok: boolean;
  data?: PaymentRow[];
  meta?: { page: number; pageSize: number; total: number; hasMore: boolean };
  error?: { code?: string; message?: string };
}

export default function MailerAdminPaymentsPage() {
  const { apiFetch, user } = useMailerAuth();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterEmail, setFilterEmail] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (filterEmail.trim()) params.set("email", filterEmail.trim().toLowerCase());
    try {
      const res = await apiFetch(`/api/desktop/admin/payments?${params.toString()}`);
      const body = (await res.json().catch(() => null)) as PaymentsResponse | null;
      if (!res.ok) {
        setError(body?.error?.message || `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(body?.data || []);
      setTotal(body?.meta?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, filterEmail]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!user) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold mb-1">Desktop Payments</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Read-only view of DesktopPayment rows. Filter by user email.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load();
        }}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <input
          type="email"
          placeholder="Filter by email"
          value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Apply
        </button>
        {filterEmail && (
          <button
            type="button"
            onClick={() => {
              setFilterEmail("");
              setPage(1);
            }}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">External ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  No payments
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{p.user.email}</td>
                  <td className="px-3 py-2">
                    {p.amount} {p.currency}
                  </td>
                  <td className="px-3 py-2">{p.status}</td>
                  <td className="px-3 py-2">{p.provider}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.externalPaymentId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
}
