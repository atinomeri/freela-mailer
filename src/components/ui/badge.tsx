"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-primary/10 dark:text-primary dark:border-primary/20",
  secondary: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-muted/65 dark:text-secondary-foreground dark:border-border/70",
  success: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-success/10 dark:text-success dark:border-success/20",
  warning: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-warning/10 dark:text-warning dark:border-warning/20",
  destructive: "bg-red-50 text-red-600 border-red-100 dark:bg-destructive/10 dark:text-destructive dark:border-destructive/20",
  outline: "border border-slate-200 bg-transparent text-slate-700 dark:border-border/70 dark:text-foreground",
};

const sizeClasses = {
  sm: "text-[11px] px-2 py-1",
  md: "text-xs px-3 py-1",
  lg: "text-sm px-4 py-2",
};

export function Badge({
  children,
  variant = "secondary",
  size = "md",
  className,
  dot,
  removable,
  onRemove,
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-bold",
        "transition-colors duration-250",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "destructive" && "bg-destructive",
            variant === "default" && "bg-primary",
            (variant === "secondary" || variant === "outline") && "bg-foreground"
          )}
        />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// Status badge with animated dot.
//
// @deprecated For mailer domain statuses (campaigns, contacts, sender accounts,
// payments) use `StatusPill` from `./status-pill` instead — it provides a typed
// status enum with one canonical color mapping. This `StatusBadge` is for
// presence indicators (online/away/busy) only and is not used by mailer pages.
interface StatusBadgeProps {
  status: "online" | "offline" | "away" | "busy";
  showLabel?: boolean;
  className?: string;
}

const statusConfig = {
  online: { color: "bg-success", label: "ონლაინ" },
  offline: { color: "bg-muted-foreground", label: "ოფლაინ" },
  away: { color: "bg-warning", label: "არ არის" },
  busy: { color: "bg-destructive", label: "დაკავებული" },
};

export function StatusBadge({
  status,
  showLabel = true,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        {status === "online" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.color
            )}
          />
        )}
        <span
          className={cn("relative inline-flex h-2 w-2 rounded-full", config.color)}
        />
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground">{config.label}</span>
      )}
    </span>
  );
}

// Count badge (for notifications, etc)
interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  className?: string;
}

export function CountBadge({
  count,
  max = 99,
  variant = "destructive",
  className,
}: CountBadgeProps) {
  if (count === 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  return (
    <Badge variant={variant} size="sm" className={cn("min-w-[18px] justify-center", className)}>
      {displayCount}
    </Badge>
  );
}
