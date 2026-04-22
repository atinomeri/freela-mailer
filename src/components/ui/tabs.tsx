"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================
// Tabs Context
// ============================================

interface TabsContextType {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs");
  }
  return context;
}

// ============================================
// Tabs Root
// ============================================

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeTab = value ?? internalValue;

  const setActiveTab = (newValue: string) => {
    if (!value) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ============================================
// Tabs List
// ============================================

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1",
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

// ============================================
// Tabs Trigger
// ============================================

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className,
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

// ============================================
// Tabs Content
// ============================================

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn("mt-4 focus-visible:outline-none", className)}
      style={{ animation: "page-in 150ms ease-out" }}
    >
      {children}
    </div>
  );
}

// ============================================
// Underline Tabs Variant
// ============================================

export function TabsListUnderline({ children, className }: TabsListProps) {
  return (
    <div
      className={cn("flex gap-4 border-b border-border", className)}
      role="tablist"
    >
      {children}
    </div>
  );
}

export function TabsTriggerUnderline({
  value,
  children,
  className,
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        "relative pb-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
      )}
    </button>
  );
}

// ============================================
// Pills Tabs Variant
// ============================================

export function TabsListPills({ children, className }: TabsListProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="tablist">
      {children}
    </div>
  );
}

export function TabsTriggerPill({
  value,
  children,
  className,
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}
