import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  resize?: "none" | "vertical" | "horizontal" | "both";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, resize = "vertical", ...props }, ref) => {
    const resizeClasses = {
      none: "resize-none",
      vertical: "resize-y",
      horizontal: "resize-x",
      both: "resize",
    };

    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[100px] w-full rounded-lg border bg-background/80 px-4 py-2 text-sm",
          "outline-none transition-all duration-200",
          "placeholder:text-muted-foreground/70",
          "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-destructive focus-visible:ring-destructive/30"
            : "border-border/80 hover:border-border",
          resizeClasses[resize],
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

// Character counter textarea
interface TextareaWithCounterProps extends TextareaProps {
  maxLength: number;
  value?: string;
}

export function TextareaWithCounter({
  maxLength,
  value = "",
  className,
  ...props
}: TextareaWithCounterProps) {
  const count = value.length;
  const isNearLimit = count > maxLength * 0.9;
  const isOverLimit = count > maxLength;

  return (
    <div className="relative">
      <Textarea
        {...props}
        value={value}
        maxLength={maxLength}
        className={cn(className, "pb-6")}
        error={isOverLimit || props.error}
      />
      <div
        className={cn(
          "absolute bottom-2 right-4 text-xs",
          isOverLimit
            ? "text-destructive"
            : isNearLimit
            ? "text-warning"
            : "text-muted-foreground"
        )}
      >
        {count}/{maxLength}
      </div>
    </div>
  );
}
