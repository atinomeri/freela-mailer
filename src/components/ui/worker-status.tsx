"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Activity, LoaderCircle, ServerCrash } from "lucide-react";

type Status = "loading" | "active" | "offline";

export function WorkerStatus({ className }: { className?: string }) {
  const { apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.workerStatus");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await apiFetch("/api/desktop/worker-health");
        if (!mounted) return;
        if (res.ok) {
           const data = await res.json();
           setStatus(data.ok ? "active" : "offline");
        } else {
           setStatus("offline");
        }
      } catch {
        if (mounted) setStatus("offline");
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [apiFetch]);

  const statusLabel =
    status === "active" ? t("active") : status === "offline" ? t("offline") : t("checking");

  const Icon = status === "offline" ? ServerCrash : status === "loading" ? LoaderCircle : Activity;
  const tone =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status === "offline"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        : "border-slate-200 bg-white text-slate-500 dark:border-border dark:bg-card dark:text-muted-foreground";
  const dot =
    status === "active" ? "bg-emerald-500" : status === "offline" ? "bg-red-500" : "bg-slate-400";

  return (
    <div
      className={cn(
        "inline-flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 shadow-sm transition-colors",
        tone,
        className,
      )}
      title={t("tooltip")}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-white/5">
        {status === "active" && (
          <span className="absolute right-1 top-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 opacity-75 animate-ping" />
        )}
        <span
          className={cn(
            "absolute right-1 top-1 inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-card",
            dot,
          )}
        />
        <Icon
          className={cn("h-4 w-4", status === "loading" && "animate-spin")}
          strokeWidth={2.3}
        />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] opacity-75">
          {t("label")}
        </span>
        <span className="block text-[13px] font-extrabold">{statusLabel}</span>
      </span>
    </div>
  );
}
