import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, leftIcon, rightIcon, ...props }, ref) => {
    if (leftIcon || rightIcon) {
      return (
        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "h-11 w-full rounded-lg border bg-background/80 text-sm",
              "outline-none transition-all duration-200",
              "placeholder:text-muted-foreground/70",
              "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
              "disabled:cursor-not-allowed disabled:opacity-60",
              error
                ? "border-destructive focus-visible:ring-destructive/30"
                : "border-border/80 hover:border-border",
              leftIcon ? "pl-12" : "px-4",
              rightIcon ? "pr-12" : "px-4",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-lg border bg-background/80 px-4 text-sm",
          "outline-none transition-all duration-200",
          "placeholder:text-muted-foreground/70",
          "focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-destructive focus-visible:ring-destructive/30"
            : "border-border/80 hover:border-border",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

// Search input with icon
import { Search } from "lucide-react";

interface SearchInputProps extends Omit<InputProps, "leftIcon"> {
  onSearch?: (value: string) => void;
}

export function SearchInput({ className, onSearch, ...props }: SearchInputProps) {
  return (
    <Input
      type="search"
      leftIcon={<Search className="h-4 w-4" />}
      className={cn("pl-10", className)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onSearch) {
          onSearch(e.currentTarget.value);
        }
      }}
      {...props}
    />
  );
}

// Password input with toggle
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordInput({ className, ...props }: InputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Input
      type={showPassword ? "text" : "password"}
      rightIcon={
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="hover:text-foreground focus:outline-none"
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      }
      className={className}
      {...props}
    />
  );
}

