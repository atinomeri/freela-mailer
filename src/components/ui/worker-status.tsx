"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMailerAuth } from "@/lib/mailer-auth";

type Status = "loading" | "online" | "offline";

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
           setStatus(data.ok ? "online" : "offline");
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
    status === "online" ? t("online") : status === "offline" ? t("offline") : t("checking");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold shadow-sm dark:border-border dark:bg-card",
        className,
      )}
      title={t("tooltip")}
    >
      <span className="relative flex h-2.5 w-2.5">
        {status === "online" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            status === "online"
              ? "bg-success"
              : status === "loading"
                ? "bg-muted-foreground"
                : "bg-destructive",
          )}
        />
      </span>
      <span className="uppercase tracking-widest text-slate-500 dark:text-muted-foreground">
        {t("label")}:{" "}
        <span
          className={cn(
            status === "online"
              ? "text-success"
              : status === "loading"
                ? "text-muted-foreground"
                : "text-destructive",
          )}
        >
          {statusLabel}
        </span>
      </span>
    </div>
  );
}
