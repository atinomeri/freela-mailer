"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMailerAuth } from "@/lib/mailer-auth";

interface DeliverabilityCheck {
  name: "SPF" | "DKIM" | "DMARC" | "MX";
  status: "pass" | "warn" | "fail";
}

interface DomainHealthResponse {
  domain?: string;
  score?: number;
  riskLevel?: "low" | "medium" | "high";
  checks?: DeliverabilityCheck[];
}

type Status = "loading" | "healthy" | "warning" | "failed";

export function DomainHealthStatus({ className }: { className?: string }) {
  const { apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.domainHealth");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let mounted = true;

    async function checkDomainHealth() {
      try {
        const res = await apiFetch("/api/desktop/domain-health");
        if (!mounted) return;
        if (!res.ok) {
          setStatus("failed");
          return;
        }

        const data = (await res.json()) as DomainHealthResponse;
        const checks = data.checks ?? [];
        const spf = checks.find((item) => item.name === "SPF")?.status;
        const dkim = checks.find((item) => item.name === "DKIM")?.status;

        if (spf === "pass" && dkim === "pass") {
          setStatus("healthy");
        } else if (spf === "fail" || dkim === "fail") {
          setStatus("failed");
        } else {
          setStatus("warning");
        }
      } catch {
        if (!mounted) return;
        setStatus("failed");
      }
    }

    void checkDomainHealth();
    const interval = setInterval(checkDomainHealth, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [apiFetch]);

  const label =
    status === "healthy"
      ? t("healthy")
      : status === "warning"
        ? t("warning")
        : status === "failed"
          ? t("failed")
          : t("checking");

  const tone = useMemo(() => {
    if (status === "healthy") return "text-emerald-600 bg-emerald-500";
    if (status === "warning") return "text-amber-600 bg-amber-500";
    if (status === "failed") return "text-red-600 bg-red-500";
    return "text-slate-500 bg-slate-400";
  }, [status]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold shadow-sm dark:border-border dark:bg-card",
        className,
      )}
      title={t("tooltip")}
    >
      <ShieldCheck className={cn("h-3.5 w-3.5", tone.split(" ")[0])} strokeWidth={2.4} />
      <span className="relative flex h-2.5 w-2.5">
        {status === "healthy" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", tone.split(" ")[1])} />
      </span>
      <span className="uppercase tracking-widest text-slate-500 dark:text-muted-foreground">
        {t("label")}: <span className={tone.split(" ")[0]}>{label}</span>
      </span>
    </div>
  );
}
