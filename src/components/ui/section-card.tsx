import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Adds standard inner padding to the body. Default true. Disable for tables that own their padding. */
  padded?: boolean;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn(
        "max-w-full overflow-hidden rounded-[32px] border-2 border-slate-100 bg-white",
        "shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-250",
        "dark:border-border dark:bg-card",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-100 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-border dark:bg-card">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[17px] font-bold tracking-normal text-slate-950 dark:text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm font-medium leading-5 text-slate-500 dark:text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("min-w-0 max-w-full", padded && "p-5 sm:p-6", bodyClassName)}>{children}</div>
    </section>
  );
}
