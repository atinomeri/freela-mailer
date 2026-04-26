import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import type { ReactNode } from "react";

// ─── Canonical mailer status enums ────────────────────────────────────────
// One source of truth for "what color is this status." Consumers pass the
// status string and the localized label; the component maps to a Badge variant.

export type CampaignStatus =
  | "draft"
  | "ready"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "paused";

export type ContactStatus = "active" | "unsubscribed" | "invalid" | "bounced";

export type SenderStatus = "connected" | "needsAttention" | "notSetUp" | "paused";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

const CAMPAIGN_VARIANT: Record<CampaignStatus, BadgeVariant> = {
  draft: "secondary",
  ready: "default",
  scheduled: "default",
  sending: "warning",
  sent: "success",
  failed: "destructive",
  paused: "secondary",
};

const CONTACT_VARIANT: Record<ContactStatus, BadgeVariant> = {
  active: "success",
  unsubscribed: "secondary",
  invalid: "warning",
  bounced: "destructive",
};

const SENDER_VARIANT: Record<SenderStatus, BadgeVariant> = {
  connected: "success",
  needsAttention: "warning",
  notSetUp: "secondary",
  paused: "secondary",
};

const PAYMENT_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  pending: "warning",
  completed: "success",
  failed: "destructive",
  refunded: "secondary",
};

const KIND_MAPS = {
  campaign: CAMPAIGN_VARIANT,
  contact: CONTACT_VARIANT,
  sender: SENDER_VARIANT,
  payment: PAYMENT_VARIANT,
} as const;

export type StatusKind = keyof typeof KIND_MAPS;

interface StatusPillProps {
  kind: StatusKind;
  /** Lowercase status identifier matching the kind enum. Unknown values fall back to secondary. */
  status: string;
  /** Localized text shown inside the pill. */
  label: ReactNode;
  size?: "sm" | "md";
  className?: string;
  /** Show the leading dot. Defaults to true — pills read as status indicators. */
  dot?: boolean;
}

export function StatusPill({
  kind,
  status,
  label,
  size = "sm",
  className,
  dot = true,
}: StatusPillProps) {
  const map = KIND_MAPS[kind] as Record<string, BadgeVariant>;
  const variant: BadgeVariant = map[status] ?? "secondary";

  return (
    <Badge
      variant={variant}
      size={size}
      dot={dot}
      className={cn("rounded-full", className)}
    >
      {label}
    </Badge>
  );
}

// Helpers so pages don't have to remember the canonical mapping when they need
// the variant for non-pill UI (e.g., row tinting).
export function campaignVariant(status: CampaignStatus): BadgeVariant {
  return CAMPAIGN_VARIANT[status] ?? "secondary";
}
export function contactVariant(status: ContactStatus): BadgeVariant {
  return CONTACT_VARIANT[status] ?? "secondary";
}
export function senderVariant(status: SenderStatus): BadgeVariant {
  return SENDER_VARIANT[status] ?? "secondary";
}
export function paymentVariant(status: PaymentStatus): BadgeVariant {
  return PAYMENT_VARIANT[status] ?? "secondary";
}
