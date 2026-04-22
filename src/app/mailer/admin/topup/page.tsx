"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useMailerAuth } from "@/lib/mailer-auth";

interface TopupResponse {
  email?: string;
  new_balance?: number;
  payment_id?: string;
  error?: string | { message?: string };
}

export default function MailerAdminTopupPage() {
  const { apiFetch, user } = useMailerAuth();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [externalPaymentId, setExternalPaymentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    const amountInt = parseInt(amount, 10);
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      setError("Amount must be a positive integer");
      setSubmitting(false);
      return;
    }

    try {
      const res = await apiFetch("/api/desktop/admin/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          amount: amountInt,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(externalPaymentId.trim()
            ? { externalPaymentId: externalPaymentId.trim() }
            : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as TopupResponse | null;

      if (!res.ok) {
        const message =
          typeof body?.error === "string"
            ? body.error
            : body?.error?.message || `HTTP ${res.status}`;
        setError(message);
      } else if (body?.email && typeof body.new_balance === "number") {
        setResult(
          `Balance for ${body.email} is now ${body.new_balance}. Payment id: ${body.payment_id}`,
        );
        setAmount("");
        setReason("");
        setExternalPaymentId("");
      } else {
        setError("Unexpected response");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold mb-1">Top Up Desktop User Balance</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Adds balance, writes a DesktopPayment + DesktopLedgerEntry. Authenticated via your
        mailer admin session — no freela.ge admin required.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-4 max-w-lg">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Amount (integer units)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Reason (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">External Payment ID (optional)</span>
          <input
            type="text"
            value={externalPaymentId}
            onChange={(e) => setExternalPaymentId(e.target.value)}
            maxLength={200}
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Top Up"}
        </button>
      </form>
      {result && (
        <div className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600">
          {result}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Card>
  );
}
