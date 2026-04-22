"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useMailerAuth } from "@/lib/mailer-auth";

interface UnsubItem {
  id: string;
  email: string;
  source: string;
  desktopUserId: string | null;
  timestamp: string;
}

interface UnsubResponse {
  count?: number;
  items?: UnsubItem[];
  error?: string;
}

export default function MailerAdminUnsubscribedPage() {
  const { apiFetch, user } = useMailerAuth();
  const [items, setItems] = useState<UnsubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/desktop/admin/unsubscribed");
      const body = (await res.json().catch(() => null)) as UnsubResponse | null;
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        setItems([]);
        return;
      }
      setItems(body?.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!user) return null;

  async function handleDelete(item: UnsubItem) {
    if (
      !confirm(
        `Remove "${item.email}" from unsubscribed list?\n\nThis will allow sending emails to this address again.`,
      )
    ) {
      return;
    }
    setDeleting(item.id);
    try {
      const res = await apiFetch("/api/desktop/admin/unsubscribed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        alert(body?.error || `HTTP ${res.status}`);
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Request failed");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = items.filter((it) =>
    it.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold mb-1">Unsubscribed Emails</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cross-tenant list of UnsubscribedEmail rows. Deletion here does not regenerate
        historical tokens; use carefully.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="search"
          placeholder="Filter by email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          Refresh
        </button>
      </div>

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
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Desktop user</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  No records
                </td>
              </tr>
            ) : (
              filtered.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(it.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{it.email}</td>
                  <td className="px-3 py-2">{it.source}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {it.desktopUserId ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(it)}
                      disabled={deleting === it.id}
                      className="rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deleting === it.id ? "Removing..." : "Remove"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
