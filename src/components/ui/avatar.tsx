import { cn } from "@/lib/utils";
import Image from "next/image";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  fallback?: React.ReactNode;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
  "2xl": "h-20 w-20 text-xl",
};

const imageSizes: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
  "2xl": 80,
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getColorFromName(name: string): string {
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-green-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-sky-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
    "bg-rose-500",
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({
  src,
  alt,
  name,
  size = "md",
  fallback,
  className,
  ...props
}: AvatarProps) {
  const initials = name ? getInitials(name) : "?";
  const fallbackContent = typeof fallback === "string" ? fallback.slice(0, 2).toUpperCase() : fallback;
  const bgColor = name ? getColorFromName(name) : "bg-muted";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {src ? (
        <Image
          src={src}
          alt={alt || name || "Avatar"}
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="h-full w-full object-cover"
        />
      ) : fallback ? (
        <div className={cn("flex h-full w-full items-center justify-center", bgColor, "text-white")}>
          {fallbackContent}
        </div>
      ) : (
        <div className={cn("flex h-full w-full items-center justify-center font-medium", bgColor, "text-white")}>
          {initials}
        </div>
      )}
    </div>
  );
}

interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({ children, max = 4, size = "md", className }: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visibleAvatars = childArray.slice(0, max);
  const remainingCount = childArray.length - max;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visibleAvatars.map((child, index) => (
        <div
          key={index}
          className="relative rounded-xl ring-2 ring-background"
          style={{ zIndex: visibleAvatars.length - index }}
        >
          {child}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            "relative flex items-center justify-center rounded-xl bg-muted text-muted-foreground font-medium ring-2 ring-background",
            sizeClasses[size]
          )}
          style={{ zIndex: 0 }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

interface AvatarWithStatusProps extends AvatarProps {
  status?: "online" | "offline" | "busy" | "away";
}

const statusColors = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  busy: "bg-red-500",
  away: "bg-yellow-500",
};

export function AvatarWithStatus({ status, size = "md", ...props }: AvatarWithStatusProps) {
  const statusSize = size === "xs" || size === "sm" ? "h-2 w-2" : "h-3 w-3";

  return (
    <div className="relative inline-block">
      <Avatar size={size} {...props} />
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-background",
            statusColors[status],
            statusSize
          )}
        />
      )}
    </div>
  );
}
