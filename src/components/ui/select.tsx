"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Select Types
// ============================================

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: boolean;
}

// ============================================
// Select Component
// ============================================

export function Select({
  options,
  value,
  onChange,
  placeholder = "აირჩიეთ...",
  disabled = false,
  className,
  error = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (isOpen) {
          const option = options[highlightedIndex];
          if (option && !option.disabled) {
            onChange?.(option.value);
            setIsOpen(false);
          }
        } else {
          setIsOpen(true);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) =>
            prev < options.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement;
      highlightedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border bg-background/80 px-4 text-sm transition-all",
          "focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
          error
            ? "border-destructive"
            : isOpen
            ? "border-ring/50 ring-2 ring-ring/30"
            : "border-border/80 hover:border-border",
          disabled && "cursor-not-allowed opacity-60"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={cn(!selectedOption && "text-muted-foreground/70")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-lg border border-border/80 bg-card/95 py-2 shadow-lg backdrop-blur-sm"
          role="listbox"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                if (!option.disabled) {
                  onChange?.(option.value);
                  setIsOpen(false);
                }
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                "flex cursor-pointer items-center justify-between px-4 py-2 text-sm",
                index === highlightedIndex && "bg-muted",
                option.disabled && "cursor-not-allowed opacity-50",
                value === option.value && "font-medium"
              )}
            >
              {option.label}
              {value === option.value && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================
// Multi Select
// ============================================

interface MultiSelectProps {
  options: SelectOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxDisplay?: number;
}

export function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "აირჩიეთ...",
  disabled = false,
  className,
  maxDisplay = 3,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter((o) => value.includes(o.value));

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange?.(value.filter((v) => v !== optionValue));
    } else {
      onChange?.([...value, optionValue]);
    }
  };

  const displayText = () => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length <= maxDisplay) {
      return selectedOptions.map((o) => o.label).join(", ");
    }
    return `${selectedOptions.slice(0, maxDisplay).map((o) => o.label).join(", ")} +${selectedOptions.length - maxDisplay}`;
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border bg-background/80 px-4 text-sm transition-all",
          "focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/30",
          isOpen ? "border-ring/50 ring-2 ring-ring/30" : "border-border/80 hover:border-border",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <span className={cn(selectedOptions.length === 0 && "text-muted-foreground/70", "truncate")}>
          {displayText()}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <ul className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-lg border border-border/80 bg-card/95 py-2 shadow-lg backdrop-blur-sm">
          {options.map((option) => (
            <li
              key={option.value}
              onClick={() => !option.disabled && toggleOption(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-muted",
                option.disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <div
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  value.includes(option.value)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                )}
              >
                {value.includes(option.value) && <Check className="h-3 w-3" />}
              </div>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
