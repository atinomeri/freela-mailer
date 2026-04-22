import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "outline" | "link";
type ButtonSize = "sm" | "md" | "lg" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-primary/70 bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:bg-primary/94 hover:shadow-soft-lg active:translate-y-0 active:shadow-soft",
  secondary:
    "border border-border/70 bg-card text-secondary-foreground shadow-sm hover:-translate-y-0.5 hover:border-border/60 hover:bg-secondary hover:shadow-soft active:translate-y-0 active:shadow-sm",
  ghost:
    "border border-transparent bg-transparent text-foreground/90 hover:-translate-y-0.5 hover:border-border/60 hover:bg-muted/55 hover:text-foreground hover:shadow-sm active:translate-y-0 active:shadow-none",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-soft active:shadow-sm",
  outline: "border border-border/80 bg-transparent text-foreground hover:border-border hover:bg-muted/45",
  link: "text-primary underline-offset-4 hover:underline p-0 h-auto"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-xs gap-2",
  md: "h-10 px-6 text-sm gap-2",
  lg: "h-12 px-8 text-sm gap-2",
  icon: "h-10 w-10"
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "btn-haptic inline-flex items-center justify-center whitespace-nowrap rounded-xl font-semibold",
        "transition-all duration-250 ease-out will-change-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      {children}
      {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
}

type ButtonLinkProps = Omit<React.ComponentProps<typeof Link>, "className"> & {
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "btn-haptic inline-flex items-center justify-center whitespace-nowrap rounded-xl font-semibold",
        "transition-all duration-250 ease-out will-change-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </Link>
  );
}

// Icon Button for toolbar-style buttons
export function IconButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "btn-haptic inline-flex h-9 w-9 items-center justify-center rounded-xl",
        "text-muted-foreground transition-all duration-250 ease-out",
        "hover:-translate-y-0.5 hover:bg-muted hover:text-foreground hover:shadow-sm active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
