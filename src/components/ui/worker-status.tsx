"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useMailerAuth } from "@/lib/mailer-auth";

export function WorkerStatus({ className }: { className?: string }) {
  const { apiFetch } = useMailerAuth();
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold shadow-sm dark:border-border dark:bg-card",
        className,
      )}
      title="Worker health: http://127.0.0.1:3001/healthz"
    >
      <span className="relative flex h-2.5 w-2.5">
        {status === "online" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", status === "online" ? "bg-success" : status === "loading" ? "bg-muted-foreground" : "bg-destructive")}></span>
      </span>
      <span className="uppercase tracking-widest text-slate-500 dark:text-muted-foreground">
        Worker 3001: <span className={cn(status === "online" ? "text-success" : status === "loading" ? "text-muted-foreground" : "text-destructive")}>{status}</span>
      </span>
    </div>
  );
}
