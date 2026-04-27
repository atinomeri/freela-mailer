import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type MetricTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "accent";

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  className?: string;
}

const toneClasses: Record<MetricTone, string> = {
  neutral: "bg-slate-50 text-slate-600 ring-slate-100 dark:bg-muted dark:text-foreground/80 dark:ring-border",
  primary: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-primary/10 dark:text-primary dark:ring-primary/15",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-success/10 dark:text-success dark:ring-success/15",
  warning: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-warning/10 dark:text-warning dark:ring-warning/15",
  destructive: "bg-red-50 text-red-600 ring-red-100 dark:bg-destructive/10 dark:text-destructive dark:ring-destructive/15",
  accent: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-accent/10 dark:text-accent dark:ring-accent/15",
};

export function MetricCard({
  label,
  value,
  description,
  icon,
  tone = "neutral",
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[32px] border-2 border-slate-100 bg-white p-6",
        "transition-all duration-250 hover:-translate-y-1 hover:border-indigo-600 hover:shadow-[0_20px_25px_-5px_rgba(79,70,229,0.10)]",
        "dark:border-border dark:bg-card dark:hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-muted-foreground">
          {label}
        </p>
        {icon && (
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-2xl ring-1 transition-colors duration-250 group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600",
              toneClasses[tone],
            )}
            aria-hidden
          >
            {icon}
          </div>
        )}
      </div>
      <p className="mt-6 text-[32px] font-extrabold leading-none tracking-normal tabular-nums text-slate-950 dark:text-foreground">
        {value}
      </p>
      {description && (
        <div className="mt-6 border-t border-slate-50 pt-4 dark:border-border/60">
          <p className="text-[12.5px] font-medium leading-5 text-slate-500 dark:text-muted-foreground">{description}</p>
        </div>
      )}
    </div>
  );
}
