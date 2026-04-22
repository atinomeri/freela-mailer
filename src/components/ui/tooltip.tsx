"use client";

import { useState, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

type TooltipPosition = "top" | "bottom" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  align?: TooltipAlign;
  delay?: number;
  className?: string;
}

// ============================================
// Position Classes
// ============================================

const positionClasses: Record<TooltipPosition, string> = {
  top: "bottom-full mb-2",
  bottom: "top-full mt-2",
  left: "right-full mr-2",
  right: "left-full ml-2",
};

const alignClasses: Record<TooltipPosition, Record<TooltipAlign, string>> = {
  top: {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  },
  bottom: {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  },
  left: {
    start: "top-0",
    center: "top-1/2 -translate-y-1/2",
    end: "bottom-0",
  },
  right: {
    start: "top-0",
    center: "top-1/2 -translate-y-1/2",
    end: "bottom-0",
  },
};

const arrowClasses: Record<TooltipPosition, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-foreground border-x-transparent border-b-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-foreground border-x-transparent border-t-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-foreground border-y-transparent border-r-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-foreground border-y-transparent border-l-transparent",
};

// ============================================
// Tooltip Component
// ============================================

export function Tooltip({
  content,
  children,
  position = "top",
  align = "center",
  delay = 200,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md",
            positionClasses[position],
            alignClasses[position][align],
            className
          )}
          style={{ animation: "tooltip-in 150ms ease-out" }}
        >
          {content}
          {/* Arrow */}
          <span
            className={cn(
              "absolute h-0 w-0 border-4",
              arrowClasses[position]
            )}
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// Simple Tooltip (for icons and buttons)
// ============================================

interface SimpleTooltipProps {
  label: string;
  children: ReactNode;
  position?: TooltipPosition;
}

export function SimpleTooltip({
  label,
  children,
  position = "top",
}: SimpleTooltipProps) {
  return (
    <Tooltip content={label} position={position}>
      {children}
    </Tooltip>
  );
}

// ============================================
// Info Tooltip (with icon)
// ============================================

import { Info } from "lucide-react";

interface InfoTooltipProps {
  content: ReactNode;
  position?: TooltipPosition;
  className?: string;
}

export function InfoTooltip({
  content,
  position = "top",
  className,
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} position={position}>
      <button
        type="button"
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
      >
        <Info className="h-3.5 w-3.5" />
        <span className="sr-only">More information</span>
      </button>
    </Tooltip>
  );
}
