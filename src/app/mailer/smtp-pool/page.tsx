"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { MailerLoginPage } from "../login-page";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Mail,
  Pencil,
  Plus,
  RotateCw,
  Server,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";

type Provider = "gmail" | "outlook" | "yahoo" | "custom";

interface ProviderConfig {
  id: Provider;
  title: string;
  description: string;
  host?: string;
  port?: number;
  secure?: boolean;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "gmail",
    title: "Gmail",
    description: "Send emails using your Google account.",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
  },
  {
    id: "outlook",
    title: "Outlook",
    description: "Send emails with your Microsoft account.",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
  },
  {
    id: "yahoo",
    title: "Yahoo",
    description: "Send emails from your Yahoo mailbox.",
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
  },
  {
    id: "custom",
    title: "Custom",
    description: "Use your own mail server settings.",
  },
];

interface PoolAccount {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string | null;
  fromName: string | null;
  active: boolean;
  failCount: number;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

interface FormState {
  email: string;
  password: string;
  smtpHost: string;
  smtpPort: string;
  secure: boolean;
  senderEmail: string;
  senderName: string;
}

interface TestResultState {
  kind: "success" | "error";
  message: string;
}

interface AccountRuntimeStatus {
  kind: "connected" | "failed" | "testing" | "paused";
  message?: string;
}

const EMPTY_FORM: FormState = {
  email: "",
  password: "",
  smtpHost: "",
  smtpPort: "465",
  secure: true,
  senderEmail: "",
  senderName: "",
};

function providerFromHost(host: string): Provider {
  const value = host.trim().toLowerCase();
  if (value === "smtp.gmail.com") return "gmail";
  if (value === "smtp.office365.com") return "outlook";
  if (value === "smtp.mail.yahoo.com") return "yahoo";
  return "custom";
}

function providerDefaults(provider: Provider): Pick<FormState, "smtpHost" | "smtpPort" | "secure"> {
  const hit = PROVIDERS.find((item) => item.id === provider);
  if (!hit?.host || !hit?.port) {
    return { smtpHost: "", smtpPort: "465", secure: true };
  }
  return { smtpHost: hit.host, smtpPort: String(hit.port), secure: hit.secure ?? hit.port === 465 };
}

function providerVariant(provider: Provider): "default" | "secondary" | "warning" | "outline" {
  if (provider === "gmail") return "default";
  if (provider === "outlook") return "secondary";
  if (provider === "yahoo") return "warning";
  return "outline";
}

function statusView(status: AccountRuntimeStatus): { text: string; badge: "success" | "warning" | "destructive" | "secondary" } {
  if (status.kind === "connected") return { text: "Connected", badge: "success" };
  if (status.kind === "testing") return { text: "Testing", badge: "secondary" };
  if (status.kind === "paused") return { text: "Paused", badge: "warning" };
  return { text: "Needs Attention", badge: "destructive" };
}

function mapApiError(body: ApiErrorShape | null, fallback: string): string {
  const apiErr = body?.error;
  if (typeof apiErr === "string") return apiErr;
  if (typeof apiErr?.message === "string") return apiErr.message;
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function ProviderCard({
  provider,
  selected,
  onSelect,
}: {
  provider: ProviderConfig;
  selected: boolean;
  onSelect: (provider: Provider) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(provider.id)}
      className={[
        "rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-primary/70 bg-primary/10 shadow-soft"
          : "border-border/80 bg-card/70 hover:border-border hover:bg-card",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">{provider.title}</span>
        <Badge size="sm" variant={providerVariant(provider.id)}>
          {provider.id === "custom" ? "Advanced" : "Recommended"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{provider.description}</p>
    </button>
  );
}

export default function SmtpPoolPage() {
  const { user, apiFetch } = useMailerAuth();
  const toast = useToast();

  const [items, setItems] = useState<PoolAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider>("gmail");
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    ...providerDefaults("gmail"),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTestResult, setFormTestResult] = useState<TestResultState | null>(null);
  const [accountStatusMap, setAccountStatusMap] = useState<Record<string, AccountRuntimeStatus>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const passwordLabel = useMemo(() => {
    if (activeProvider === "gmail" || activeProvider === "yahoo") return "App Password";
    return "Password";
  }, [activeProvider]);

  const isCustomProvider = activeProvider === "custom";
  const isEditing = Boolean(editingId);

  const loadPool = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/desktop/smtp-pool");
      if (!res.ok) throw new Error("Failed to load sending accounts");
      const body = await res.json();
      const accounts = (body.data ?? []) as PoolAccount[];
      setItems(accounts);

      const nextStatus: Record<string, AccountRuntimeStatus> = {};
      for (const item of accounts) {
        nextStatus[item.id] = item.active
          ? { kind: item.failCount > 0 ? "failed" : "connected" }
          : { kind: "paused" };
      }
      setAccountStatusMap(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sending accounts");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!user) return;
    void loadPool();
  }, [user, loadPool]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("mailer:auto-rotate");
    if (stored === "1") setAutoRotateEnabled(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mailer:auto-rotate", autoRotateEnabled ? "1" : "0");
  }, [autoRotateEnabled]);

  if (!user) return <MailerLoginPage />;

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetComposer(provider: Provider = activeProvider) {
    const defaults = providerDefaults(provider);
    setForm({
      ...EMPTY_FORM,
      ...defaults,
    });
    setFormErrors({});
    setFormTestResult(null);
    setEditingId(null);
    setShowAdvanced(provider === "custom");
  }

  function onProviderChange(next: Provider) {
    setActiveProvider(next);
    const defaults = providerDefaults(next);
    setForm((prev) => ({
      ...prev,
      smtpHost: defaults.smtpHost,
      smtpPort: defaults.smtpPort,
      secure: defaults.secure,
      email: "",
      password: "",
      senderEmail: "",
      senderName: "",
    }));
    setFormErrors({});
    setFormTestResult(null);
    setEditingId(null);
    setShowAdvanced(next === "custom");
  }

  function validateForm(forTest: boolean): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.email.trim()) {
      next.email = "Email is required.";
    } else if (!isValidEmail(form.email)) {
      next.email = "Please enter a valid email address.";
    }

    const needsPassword = !isEditing || forTest;
    if (needsPassword && !form.password.trim()) {
      next.password = activeProvider === "gmail" || activeProvider === "yahoo"
        ? "App Password is required."
        : "Password is required.";
    }

    if (isCustomProvider) {
      if (!form.smtpHost.trim()) next.smtpHost = "SMTP Host is required.";
      const port = Number(form.smtpPort);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        next.smtpPort = "Port must be between 1 and 65535.";
      }
      if (form.senderEmail.trim() && !isValidEmail(form.senderEmail)) {
        next.senderEmail = "Sender Email must be valid.";
      }
    }

    return next;
  }

  function buildPayload(includeOptionalPassword = true) {
    const defaults = providerDefaults(activeProvider);
    const host = isCustomProvider ? form.smtpHost.trim() : defaults.smtpHost;
    const port = isCustomProvider ? Number(form.smtpPort) : Number(defaults.smtpPort);
    const secure = isCustomProvider ? form.secure : defaults.secure;
    const payload: Record<string, unknown> = {
      host,
      port,
      secure,
      username: form.email.trim(),
      fromEmail: isCustomProvider ? (form.senderEmail.trim() || null) : null,
      fromName: isCustomProvider ? (form.senderName.trim() || null) : null,
    };
    if (includeOptionalPassword) {
      payload.password = form.password;
    } else if (form.password.trim()) {
      payload.password = form.password;
    }
    return payload;
  }

  async function handleTestConnection() {
    setError("");
    setFormTestResult(null);
    const validation = validateForm(true);
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setTesting(true);
    try {
      const usingStoredAccount = Boolean(isEditing && !form.password.trim() && editingId);
      const body = usingStoredAccount
        ? { accountId: editingId }
        : buildPayload(true);
      const res = await apiFetch("/api/desktop/smtp-pool/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const responseBody = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(mapApiError(responseBody, "Connection failed. Please check your settings."));
      }
      setFormTestResult({ kind: "success", message: "Connection successful." });
      toast.success("Connection successful.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed. Please check your settings.";
      setFormTestResult({ kind: "error", message });
      toast.error("Connection failed.", message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const validation = validateForm(false);
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      const method = isEditing ? "PATCH" : "POST";
      const url = isEditing ? `/api/desktop/smtp-pool/${editingId}` : "/api/desktop/smtp-pool";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(!isEditing)),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(mapApiError(body, "Unable to save account"));
      }
      toast.success(isEditing ? "Account updated successfully." : "Email account added successfully.");
      resetComposer(activeProvider);
      await loadPool();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save account";
      setError(message);
      toast.error("Save failed.", message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(account: PoolAccount) {
    const provider = providerFromHost(account.host);
    setActiveProvider(provider);
    setEditingId(account.id);
    setShowAdvanced(provider === "custom");
    setForm({
      email: account.username,
      password: "",
      smtpHost: account.host,
      smtpPort: String(account.port),
      secure: account.secure,
      senderEmail: account.fromEmail ?? "",
      senderName: account.fromName ?? "",
    });
    setFormErrors({});
    setFormTestResult(null);
  }

  async function removeAccount(id: string) {
    setError("");
    if (!window.confirm("Remove this account?")) return;
    setBusyActionId(id);
    try {
      const res = await apiFetch(`/api/desktop/smtp-pool/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove account");
      setItems((prev) => prev.filter((item) => item.id !== id));
      setAccountStatusMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("Account removed.");
      if (editingId === id) {
        resetComposer(activeProvider);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove account";
      setError(message);
      toast.error("Remove failed.", message);
    } finally {
      setBusyActionId(null);
    }
  }

  async function testSavedAccount(account: PoolAccount) {
    setBusyActionId(account.id);
    setAccountStatusMap((prev) => ({ ...prev, [account.id]: { kind: "testing" } }));
    try {
      const res = await apiFetch("/api/desktop/smtp-pool/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(mapApiError(body, "Connection failed. Please check your settings."));
      }
      setAccountStatusMap((prev) => ({
        ...prev,
        [account.id]: { kind: account.active ? "connected" : "paused" },
      }));
      toast.success("Connection successful.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed. Please check your settings.";
      setAccountStatusMap((prev) => ({
        ...prev,
        [account.id]: { kind: "failed", message },
      }));
      toast.error("Connection failed.", message);
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sending Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your email accounts to send campaigns reliably.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="p-6" hover={false}>
        <form className="space-y-6" onSubmit={handleSave}>
          <div>
            <h2 className="text-base font-semibold">Choose provider</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with a provider and we will configure the basics for you.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PROVIDERS.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  selected={provider.id === activeProvider}
                  onSelect={onProviderChange}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/40 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {isEditing ? "Edit Email Account" : "Add Email Account"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activeProvider === "custom"
                    ? "Use your own server settings for this account."
                    : "Technical SMTP fields are hidden for this provider."}
                </p>
              </div>
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => resetComposer(activeProvider)}
                >
                  Cancel Edit
                </Button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Email</span>
                <Input
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  placeholder="name@company.com"
                  error={Boolean(formErrors.email)}
                  required
                />
                {formErrors.email && <span className="text-xs text-destructive">{formErrors.email}</span>}
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{passwordLabel}</span>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  placeholder={passwordLabel === "App Password" ? "Enter app password" : "Enter password"}
                  error={Boolean(formErrors.password)}
                  required={!isEditing}
                />
                {isEditing && (
                  <span className="text-xs text-muted-foreground">
                    Leave blank to keep your current password.
                  </span>
                )}
                {formErrors.password && (
                  <span className="text-xs text-destructive">{formErrors.password}</span>
                )}
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Server className="h-4 w-4" />
                Advanced Settings
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {(isCustomProvider || showAdvanced) && (
              <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">SMTP Host</span>
                  <Input
                    value={form.smtpHost}
                    onChange={(e) => updateForm("smtpHost", e.target.value)}
                    placeholder="smtp.yourprovider.com"
                    error={Boolean(formErrors.smtpHost)}
                    disabled={!isCustomProvider}
                    required={isCustomProvider}
                  />
                  {formErrors.smtpHost && (
                    <span className="text-xs text-destructive">{formErrors.smtpHost}</span>
                  )}
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Port</span>
                  <Input
                    value={form.smtpPort}
                    onChange={(e) => updateForm("smtpPort", e.target.value)}
                    placeholder="465"
                    error={Boolean(formErrors.smtpPort)}
                    disabled={!isCustomProvider}
                    required={isCustomProvider}
                  />
                  {formErrors.smtpPort && (
                    <span className="text-xs text-destructive">{formErrors.smtpPort}</span>
                  )}
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Sender Email (optional)</span>
                  <Input
                    value={form.senderEmail}
                    onChange={(e) => updateForm("senderEmail", e.target.value)}
                    placeholder="sender@company.com"
                    error={Boolean(formErrors.senderEmail)}
                  />
                  {formErrors.senderEmail && (
                    <span className="text-xs text-destructive">{formErrors.senderEmail}</span>
                  )}
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Sender Name (optional)</span>
                  <Input
                    value={form.senderName}
                    onChange={(e) => updateForm("senderName", e.target.value)}
                    placeholder="Your brand name"
                  />
                </label>

                <label className="md:col-span-2 flex items-center gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(e) => updateForm("secure", e.target.checked)}
                    disabled={!isCustomProvider}
                    className="h-4 w-4"
                  />
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <span>Use secure TLS/SSL</span>
                  </div>
                </label>
              </div>
            )}

            {formTestResult && (
              <div
                className={[
                  "mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  formTestResult.kind === "success"
                    ? "border border-success/30 bg-success/5 text-success"
                    : "border border-destructive/30 bg-destructive/5 text-destructive",
                ].join(" ")}
              >
                {formTestResult.kind === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <TriangleAlert className="h-4 w-4" />
                )}
                {formTestResult.message}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                loading={testing}
                leftIcon={<Mail className="h-4 w-4" />}
              >
                Test Connection
              </Button>
              <Button
                type="submit"
                loading={saving}
                leftIcon={isEditing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              >
                {isEditing ? "Save Changes" : "Add Email Account"}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <Card className="p-4" hover={false}>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={autoRotateEnabled}
            onChange={(e) => setAutoRotateEnabled(e.target.checked)}
          />
          <div>
            <p className="font-medium">Automatically distribute emails between accounts</p>
            <p className="text-xs text-muted-foreground">
              When enabled, active accounts are used in rotation during sending.
            </p>
          </div>
        </label>
      </Card>

      <Card className="p-6" hover={false}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Configured Accounts</h2>
            <p className="text-sm text-muted-foreground">
              Manage connected accounts and monitor their status.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading accounts...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-8 text-center">
            <h3 className="text-base font-semibold">No Sending Accounts yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first email account to start sending campaigns.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const provider = providerFromHost(item.host);
              const runtimeStatus = accountStatusMap[item.id] ??
                (item.active ? { kind: "connected" as const } : { kind: "paused" as const });
              const statusMeta = statusView(runtimeStatus);
              const rotationEnabled = autoRotateEnabled && item.active;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/80 bg-background/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.username}</span>
                        <Badge size="sm" variant={providerVariant(provider)}>
                          {provider === "custom"
                            ? "Custom"
                            : provider.charAt(0).toUpperCase() + provider.slice(1)}
                        </Badge>
                        <Badge size="sm" variant={statusMeta.badge}>
                          {statusMeta.text}
                        </Badge>
                        <Badge size="sm" variant={rotationEnabled ? "success" : "secondary"}>
                          Rotation {rotationEnabled ? "On" : "Off"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.host}:{item.port}
                        {item.fromEmail ? ` • Sender: ${item.fromEmail}` : ""}
                        {runtimeStatus.message ? ` • ${runtimeStatus.message}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busyActionId === item.id && runtimeStatus.kind === "testing"}
                        leftIcon={<RotateCw className="h-4 w-4" />}
                        onClick={() => testSavedAccount(item)}
                      >
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<Pencil className="h-4 w-4" />}
                        onClick={() => startEdit(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busyActionId === item.id && runtimeStatus.kind !== "testing"}
                        onClick={() => removeAccount(item.id)}
                        leftIcon={<Trash2 className="h-4 w-4 text-destructive" />}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
