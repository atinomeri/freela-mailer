"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// Dropdown Context
interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  closeOnSelect: boolean;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error("Dropdown components must be used within a Dropdown");
  }
  return context;
}

// Main Dropdown
interface DropdownProps {
  children: ReactNode;
  closeOnSelect?: boolean;
}

export function Dropdown({ children, closeOnSelect = true }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, closeOnSelect }}>
      <div ref={dropdownRef} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

// Dropdown Trigger
interface DropdownTriggerProps {
  children: ReactNode;
  asChild?: boolean;
  className?: string;
}

export function DropdownTrigger({
  children,
  asChild,
  className,
}: DropdownTriggerProps) {
  const { isOpen, setIsOpen } = useDropdown();

  if (asChild) {
    return (
      <div onClick={() => setIsOpen(!isOpen)} className={className}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-2 text-sm font-medium",
        "shadow-sm transition-all duration-250 hover:bg-muted/55",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

// Dropdown Content
interface DropdownContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function DropdownContent({
  children,
  align = "start",
  className,
}: DropdownContentProps) {
  const { isOpen } = useDropdown();

  if (!isOpen) return null;

  const alignClasses = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  return (
    <div
      className={cn(
        "absolute top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft",
        "animate-fade-in",
        alignClasses[align],
        className
      )}
    >
      {children}
    </div>
  );
}

// Dropdown Item
interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function DropdownItem({
  children,
  onClick,
  disabled,
  destructive,
  icon,
  className,
}: DropdownItemProps) {
  const { setIsOpen, closeOnSelect } = useDropdown();

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    if (closeOnSelect) {
      setIsOpen(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm",
        "transition-colors duration-200",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-muted/65",
        destructive && "text-destructive hover:bg-destructive/10",
        className
      )}
    >
      {icon && <span className="h-4 w-4">{icon}</span>}
      {children}
    </button>
  );
}

// Dropdown Separator
export function DropdownSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-border", className)} />;
}

// Dropdown Label
export function DropdownLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-4 py-2 text-xs font-semibold text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
