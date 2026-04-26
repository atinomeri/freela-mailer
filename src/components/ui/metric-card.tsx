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
  neutral: "bg-muted text-foreground/80 ring-border",
  primary: "bg-primary/10 text-primary ring-primary/15",
  success: "bg-success/10 text-success ring-success/15",
  warning: "bg-warning/10 text-warning ring-warning/15",
  destructive: "bg-destructive/10 text-destructive ring-destructive/15",
  accent: "bg-accent/10 text-accent ring-accent/15",
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
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5",
        "shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
        "transition-colors duration-250 hover:border-foreground/15",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {icon && (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg ring-1 transition-transform duration-250 group-hover:scale-105",
              toneClasses[tone],
            )}
            aria-hidden
          >
            {icon}
          </div>
        )}
      </div>
      <p className="mt-5 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {value}
      </p>
      {description && (
        <div className="mt-5 border-t border-border/60 pt-3">
          <p className="text-[12.5px] leading-5 text-muted-foreground">{description}</p>
        </div>
      )}
    </div>
  );
}
