import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  className?: string;
  backButton?: ReactNode;
  stepper?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  center,
  actions,
  className,
  backButton,
  stepper
}: PageHeaderProps) {
  const centerContent = center ?? stepper;

  return (
    <header
      className={cn(
        "grid min-h-20 min-w-0 max-w-full gap-4 border-b border-slate-200 pb-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center dark:border-border",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3 lg:col-start-1">
        {backButton}
        <div className="min-w-0 space-y-1">
          {eyebrow && (
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-indigo-600 dark:text-primary">
              {eyebrow}
            </div>
          )}
          <div>
            <h1 className="break-words text-[22px] font-extrabold tracking-tight text-slate-950 dark:text-foreground sm:text-[28px]">
              {title}
            </h1>
          </div>
          {description && (
            <p className="max-w-2xl break-words text-[14px] font-semibold leading-6 text-slate-500 dark:text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      {centerContent && (
        <div
          className={cn(
            "min-w-0 items-center justify-start lg:col-start-2 lg:justify-center",
            center ? "flex" : "hidden lg:flex",
          )}
        >
          {centerContent}
        </div>
      )}

      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-start gap-3 lg:col-start-3 lg:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
