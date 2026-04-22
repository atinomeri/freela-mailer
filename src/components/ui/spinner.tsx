import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-primary", sizeClasses[size], className)}
    />
  );
}

// Full page loading spinner
export function PageSpinner() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

// Inline loading spinner with text
interface LoadingProps {
  text?: string;
  className?: string;
}

export function Loading({ text = "იტვირთება...", className }: LoadingProps) {
  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <Spinner size="sm" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

// Dots loading animation
export function DotsLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-primary"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

// Skeleton shimmer loading
export function ShimmerLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer",
        "before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
        className
      )}
    />
  );
}
