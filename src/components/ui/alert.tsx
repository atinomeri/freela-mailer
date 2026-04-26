"use client";

import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

export type AlertVariant = "info" | "success" | "warning" | "destructive";

interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Custom leading icon. Defaults to a variant-appropriate icon. Pass null to hide. */
  icon?: ReactNode | null;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  info: "border-border/70 bg-muted/45 text-foreground",
  success: "border-success/30 bg-success/5 text-success",
  warning: "border-warning/30 bg-warning/5 text-warning",
  destructive: "border-destructive/30 bg-destructive/5 text-destructive",
};

const defaultIcons: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  destructive: AlertCircle,
};

export function Alert({
  variant = "info",
  title,
  children,
  icon,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: AlertProps) {
  const DefaultIcon = defaultIcons[variant];
  const renderedIcon =
    icon === null
      ? null
      : icon ?? <DefaultIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden />;

  return (
    <div
      role={variant === "destructive" || variant === "warning" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm leading-5",
        variantClasses[variant],
        className,
      )}
    >
      {renderedIcon && <span className="mt-0.5 shrink-0">{renderedIcon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && (
          <div className={cn(title && "mt-0.5", "leading-5")}>{children}</div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            "shrink-0 rounded-md p-1 transition-opacity hover:opacity-70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
