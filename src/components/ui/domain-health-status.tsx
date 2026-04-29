"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Globe2,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMailerAuth } from "@/lib/mailer-auth";

interface DeliverabilityCheck {
  name: "SPF" | "DKIM" | "DMARC" | "MX";
  status: "pass" | "warn" | "fail";
}

interface DomainHealthItem {
  domain: string;
  score: number;
  riskLevel: "low" | "medium" | "high";
  ready: boolean;
  status: "ready" | "review" | "failed";
  checks: DeliverabilityCheck[];
}

interface DomainHealthResponse {
  readyCount?: number;
  totalCount?: number;
  domains?: DomainHealthItem[];
}

type Status = "loading" | "ready" | "review" | "failed";

function checkTone(status: DeliverabilityCheck["status"]) {
  if (status === "pass") return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30";
  if (status === "warn") return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30";
  return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30";
}

function statusIcon(status: DomainHealthItem["status"]) {
  if (status === "ready") return CheckCircle2;
  if (status === "review") return AlertTriangle;
  return XCircle;
}

export function DomainHealthStatus({ className }: { className?: string }) {
  const { apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.domainHealth");
  const [status, setStatus] = useState<Status>("loading");
  const [domains, setDomains] = useState<DomainHealthItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function checkDomainHealth() {
      try {
        const res = await apiFetch("/api/desktop/domain-health");
        if (!mounted) return;
        if (!res.ok) {
          setStatus("failed");
          setDomains([]);
          return;
        }

        const data = (await res.json()) as DomainHealthResponse;
        const nextDomains = data.domains ?? [];
        setDomains(nextDomains);

        if (nextDomains.length === 0) {
          setStatus("failed");
        } else if (nextDomains.every((item) => item.ready)) {
          setStatus("ready");
        } else if (nextDomains.some((item) => item.status === "failed")) {
          setStatus("failed");
        } else {
          setStatus("review");
        }
      } catch {
        if (!mounted) return;
        setStatus("failed");
        setDomains([]);
      }
    }

    void checkDomainHealth();
    const interval = setInterval(checkDomainHealth, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [apiFetch]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const readyCount = domains.filter((item) => item.ready).length;
  const totalCount = domains.length;
  const summary = totalCount > 0
    ? t("summary", { ready: readyCount, total: totalCount })
    : t("checking");

  const tone = useMemo(() => {
    if (status === "ready") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
    }
    if (status === "review") {
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
    }
    if (status === "failed") {
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";
    }
    return "border-slate-200 bg-white text-slate-500 dark:border-border dark:bg-card dark:text-muted-foreground";
  }, [status]);

  const dot =
    status === "ready" ? "bg-emerald-500" : status === "review" ? "bg-amber-500" : status === "failed" ? "bg-red-500" : "bg-slate-400";
  const MainIcon = status === "loading" ? LoaderCircle : ShieldCheck;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
          tone,
        )}
        onClick={() => setOpen((value) => !value)}
        title={t("tooltip")}
        aria-expanded={open}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-white/5">
          {status === "ready" && (
            <span className="absolute right-1 top-1 inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-500 opacity-75" />
          )}
          <span
            className={cn(
              "absolute right-1 top-1 inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-card",
              dot,
            )}
          />
          <MainIcon
            className={cn("h-4 w-4", status === "loading" && "animate-spin")}
            strokeWidth={2.3}
          />
        </span>
        <span className="min-w-[132px] leading-tight">
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] opacity-75">
            {t("label")}
          </span>
          <span className="block text-[13px] font-extrabold">{summary}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          strokeWidth={2.3}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-border dark:bg-card">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Globe2 className="h-4 w-4 text-slate-500 dark:text-muted-foreground" />
            <div>
              <div className="text-[13px] font-extrabold text-slate-950 dark:text-foreground">
                {t("detailsTitle")}
              </div>
              <div className="text-[12px] font-semibold text-slate-500 dark:text-muted-foreground">
                {summary}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {domains.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-500 dark:border-border dark:bg-muted/30 dark:text-muted-foreground">
                {t("empty")}
              </div>
            ) : (
              domains.map((domain) => {
                const Icon = statusIcon(domain.status);
                return (
                  <div
                    key={domain.domain}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-border dark:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-extrabold text-slate-950 dark:text-foreground">
                          {domain.domain}
                        </div>
                        <div className="mt-1 text-[12px] font-semibold text-slate-500 dark:text-muted-foreground">
                          {t(`statuses.${domain.status}`)} · {domain.score}/100
                        </div>
                      </div>
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          domain.status === "ready"
                            ? "text-emerald-600 dark:text-emerald-300"
                            : domain.status === "review"
                              ? "text-amber-600 dark:text-amber-300"
                              : "text-red-600 dark:text-red-300",
                        )}
                        strokeWidth={2.4}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {domain.checks.map((check) => (
                        <span
                          key={`${domain.domain}-${check.name}`}
                          className={cn(
                            "rounded-md px-2 py-1 text-[11px] font-extrabold ring-1",
                            checkTone(check.status),
                          )}
                        >
                          {check.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
