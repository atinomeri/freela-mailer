"use client";

import { cn } from "@/lib/utils";
import { FileQuestion, Search, Inbox, FolderOpen, Users, Briefcase } from "lucide-react";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Button, ButtonLink } from "./button";

/**
 * Existing callers across the app pass icons sized like `h-12 w-12`. The new
 * default visual wraps the icon in a 48px tile so a 20-24px glyph reads best.
 * To avoid forcing every caller to update, we clone the icon element and
 * override its size class. Non-element icons (strings, fragments) render as-is.
 */
function normalizeIcon(icon: ReactNode, sizeClass: string): ReactNode {
  if (!isValidElement(icon)) return icon;
  const element = icon as ReactElement<{ className?: string }>;
  const incoming = element.props.className ?? "";
  // Strip any incoming h-N / w-N utilities and apply the canonical size.
  const stripped = incoming
    .split(/\s+/)
    .filter((token) => !/^(h|w|size)-/.test(token))
    .join(" ");
  return cloneElement(element, {
    className: cn(stripped, sizeClass),
  });
}

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Primary action — recommended next step. */
  action?: EmptyStateAction;
  /** Optional secondary action shown alongside the primary. */
  secondaryAction?: EmptyStateAction;
  className?: string;
  variant?: "default" | "compact" | "minimal";
}

function renderAction(action: EmptyStateAction, primary: boolean) {
  const variant = primary ? "primary" : "secondary";
  const size = primary ? "md" : "sm";

  if (action.href) {
    return (
      <ButtonLink href={action.href} variant={variant} size={size}>
        {action.label}
      </ButtonLink>
    );
  }
  return (
    <Button variant={variant} size={size} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = "default",
}: EmptyStateProps) {
  const minimalIcon = normalizeIcon(icon ?? <FileQuestion strokeWidth={1.8} />, "h-6 w-6");
  const compactIcon = normalizeIcon(icon ?? <FileQuestion />, "h-5 w-5");
  const defaultIcon = normalizeIcon(icon ?? <FileQuestion strokeWidth={1.8} />, "h-[22px] w-[22px]");

  if (variant === "minimal") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
        <div className="text-muted-foreground/60">{minimalIcon}</div>
        <p className="mt-2 text-sm text-muted-foreground">{title}</p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-4",
          className,
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {compactIcon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && renderAction(action, false)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative">
        <div
          className="absolute inset-0 -m-2 rounded-2xl bg-primary/5 blur-xl"
          aria-hidden
        />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-card text-primary shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
          {defaultIcon}
        </div>
      </div>
      <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-[1.55] text-muted-foreground">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action && renderAction(action, true)}
          {secondaryAction && renderAction(secondaryAction, false)}
        </div>
      )}
    </div>
  );
}

// ─── Legacy presets (inherited from freela.ge monolith) ───────────────────
// Not used by the mailer product. Kept exported to avoid breaking other call
// sites in the wider workspace. Do not adopt these in mailer pages.

/** @deprecated Legacy freela.ge preset. Use <EmptyState /> directly in mailer pages. */
export function NoSearchResults({ query, className }: { query?: string; className?: string }) {
  return (
    <EmptyState
      icon={<Search className="h-6 w-6" />}
      title={query ? `"${query}" - შედეგები არ მოიძებნა` : "შედეგები არ მოიძებნა"}
      description="სცადეთ სხვა საძიებო სიტყვები ან შეცვალეთ ფილტრები"
      className={className}
    />
  );
}

/** @deprecated Legacy freela.ge preset. Use <EmptyState /> directly in mailer pages. */
export function NoProjects({ className, onCreateClick }: { className?: string; onCreateClick?: () => void }) {
  return (
    <EmptyState
      icon={<Briefcase className="h-6 w-6" />}
      title="შეკვეთები არ არის"
      description="დაიწყეთ ახალი შეკვეთის შექმნა და იპოვეთ საუკეთესო ფრილანსერები"
      action={onCreateClick ? { label: "ახალი შეკვეთა", onClick: onCreateClick } : undefined}
      className={className}
    />
  );
}

/** @deprecated Legacy freela.ge preset. Use <EmptyState /> directly in mailer pages. */
export function NoFreelancers({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Users className="h-6 w-6" />}
      title="ფრილანსერები არ მოიძებნა"
      description="სცადეთ სხვა კატეგორია ან შეცვალეთ ფილტრები"
      className={className}
    />
  );
}

/** @deprecated Legacy freela.ge preset. Use <EmptyState /> directly in mailer pages. */
export function NoMessages({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Inbox className="h-6 w-6" />}
      title="შეტყობინებები არ არის"
      description="აქ გამოჩნდება თქვენი მიმოწერა დამკვეთებთან ან ფრილანსერებთან"
      className={className}
    />
  );
}

/** @deprecated Legacy freela.ge preset. Use <EmptyState /> directly in mailer pages. */
export function NoNotifications({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Inbox className="h-6 w-6" />}
      title="შეტყობინებები არ არის"
      description="აქ გამოჩნდება ახალი შეტყობინებები და განახლებები"
      variant="minimal"
      className={className}
    />
  );
}

// Re-exported icon helpers for backwards compatibility with consumers.
export { FolderOpen };
