import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Children, cloneElement, isValidElement, type ReactElement } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "outline" | "link";
type ButtonSize = "sm" | "md" | "lg" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /**
   * When true, renders the only child as the trigger element instead of a <button>.
   * Useful for wrapping <Link> components without nesting <button><a>. The child
   * receives merged className. `loading`, `leftIcon`, `rightIcon` are ignored when
   * asChild is true — put them inside the child instead.
   */
  asChild?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-indigo-600 bg-indigo-600 text-white shadow-none hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_0_15px_rgba(79,70,229,0.2)] active:translate-y-0 dark:border-primary dark:bg-primary dark:text-primary-foreground dark:shadow-none",
  secondary:
    "border border-slate-200 bg-white text-slate-900 shadow-sm hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-slate-50 hover:shadow-lg hover:shadow-slate-200/50 active:translate-y-0 dark:border-border dark:bg-card dark:text-secondary-foreground dark:hover:bg-secondary",
  ghost:
    "border border-transparent bg-transparent text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-950 active:translate-y-0 active:shadow-none dark:text-foreground/90 dark:hover:border-border dark:hover:bg-muted/65 dark:hover:text-foreground",
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

const baseClasses = cn(
  "btn-haptic inline-flex items-center justify-center whitespace-nowrap rounded-[14px] font-medium font-sans",
  "transition-all duration-250 ease-out will-change-transform",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:pointer-events-none disabled:opacity-50",
);

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const composed = cn(baseClasses, variantClasses[variant], sizeClasses[size], className);

  if (asChild) {
    if (!isValidElement(children)) {
      return null;
    }
    const child = Children.only(children) as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      className: cn(composed, child.props.className),
    });
  }

  return (
    <button
      className={composed}
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
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
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
