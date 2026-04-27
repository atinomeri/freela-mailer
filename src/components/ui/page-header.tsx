import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  backButton?: ReactNode;
  stepper?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  backButton,
  stepper
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-20 flex-col justify-between gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-center dark:border-border",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {backButton}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {eyebrow && (
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-600 dark:text-primary">
                {eyebrow} <span className="text-muted-foreground/50 mx-1">•</span>
              </span>
            )}
            <h1 className="text-[22px] font-extrabold tracking-tight text-slate-950 dark:text-foreground sm:text-[28px]">
              {title}
            </h1>
          </div>
          {description && (
            <p className="mt-2 max-w-2xl text-[14.5px] font-medium leading-6 text-slate-500 dark:text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      {stepper && (
        <div className="hidden lg:flex flex-1 justify-center">
          {stepper}
        </div>
      )}

      {actions && (
        <div className="flex shrink-0 items-center gap-3">
          {actions}
        </div>
      )}
    </header>
  );
}
