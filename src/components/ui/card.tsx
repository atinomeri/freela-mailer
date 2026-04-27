import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  clickable?: boolean;
}

export function Card({ className, hover = true, clickable = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[32px] border-2 border-slate-100 bg-white text-slate-900 transition-all duration-300 ease-out will-change-transform dark:border-border dark:bg-card dark:text-card-foreground",
        hover && "hover:-translate-y-1 hover:border-indigo-600 hover:shadow-[0_20px_25px_-5px_rgba(79,70,229,0.10)] dark:hover:border-primary/40",
        clickable && "cursor-pointer card-touch",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  );
}

/**
 * @deprecated Mailer visual spec forbids gradients. Prefer `SectionCard` instead.
 * Kept for backwards compatibility with non-mailer surfaces inherited from the monolith.
 */
export function GradientCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-transparent p-[1px]",
        className
      )}
    >
      <div
        className="h-full w-full rounded-[15px] bg-card p-6 shadow-soft"
        {...props}
      />
    </div>
  );
}

/**
 * @deprecated Mailer visual spec forbids glow effects. Prefer `SectionCard` instead.
 * Kept for backwards compatibility with non-mailer surfaces inherited from the monolith.
 */
export function GlowCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl bg-card p-6 text-card-foreground shadow-soft transition-all duration-300 ease-out will-change-transform",
        "hover:shadow-soft-lg",
        className
      )}
      {...props}
    />
  );
}
