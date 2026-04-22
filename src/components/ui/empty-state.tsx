"use client";

import { cn } from "@/lib/utils";
import { FileQuestion, Search, Inbox, FolderOpen, Users, Briefcase } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
  variant?: "default" | "compact" | "minimal";
}

const defaultIcons = {
  search: Search,
  inbox: Inbox,
  folder: FolderOpen,
  users: Users,
  projects: Briefcase,
  default: FileQuestion,
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const Icon = icon || <FileQuestion className="h-12 w-12" />;

  if (variant === "minimal") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
        <div className="text-muted-foreground/50">{Icon}</div>
        <p className="mt-2 text-sm text-muted-foreground">{title}</p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-4 rounded-lg border border-dashed p-4", className)}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon || <FileQuestion className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <p className="font-medium">{title}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-12 text-center",
      className
    )}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {Icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

// Pre-configured empty states
export function NoSearchResults({ query, className }: { query?: string; className?: string }) {
  return (
    <EmptyState
      icon={<Search className="h-12 w-12" />}
      title={query ? `"${query}" - შედეგები არ მოიძებნა` : "შედეგები არ მოიძებნა"}
      description="სცადეთ სხვა საძიებო სიტყვები ან შეცვალეთ ფილტრები"
      className={className}
    />
  );
}

export function NoProjects({ className, onCreateClick }: { className?: string; onCreateClick?: () => void }) {
  return (
    <EmptyState
      icon={<Briefcase className="h-12 w-12" />}
      title="შეკვეთები არ არის"
      description="დაიწყეთ ახალი შეკვეთის შექმნა და იპოვეთ საუკეთესო ფრილანსერები"
      action={onCreateClick ? { label: "ახალი შეკვეთა", onClick: onCreateClick } : undefined}
      className={className}
    />
  );
}

export function NoFreelancers({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Users className="h-12 w-12" />}
      title="ფრილანსერები არ მოიძებნა"
      description="სცადეთ სხვა კატეგორია ან შეცვალეთ ფილტრები"
      className={className}
    />
  );
}

export function NoMessages({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Inbox className="h-12 w-12" />}
      title="შეტყობინებები არ არის"
      description="აქ გამოჩნდება თქვენი მიმოწერა დამკვეთებთან ან ფრილანსერებთან"
      className={className}
    />
  );
}

export function NoNotifications({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Inbox className="h-12 w-12" />}
      title="შეტყობინებები არ არის"
      description="აქ გამოჩნდება ახალი შეტყობინებები და განახლებები"
      variant="minimal"
      className={className}
    />
  );
}
