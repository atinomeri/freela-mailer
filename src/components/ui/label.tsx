import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  error?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, required, error, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "text-sm font-medium leading-none",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          error ? "text-destructive" : "text-foreground",
          className
        )}
        {...props}
      >
        {children}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
    );
  }
);

Label.displayName = "Label";

// Form field wrapper with label and error message
interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required} error={!!error}>
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
