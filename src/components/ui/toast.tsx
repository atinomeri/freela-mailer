"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (options: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

// ============================================
// Context
// ============================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============================================
// Provider
// ============================================

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (options: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      const duration = options.duration ?? 5000;

      setToasts((prev) => [...prev, { ...options, id }]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const success = useCallback(
    (title: string, description?: string) => {
      toast({ type: "success", title, description });
    },
    [toast]
  );

  const error = useCallback(
    (title: string, description?: string) => {
      toast({ type: "error", title, description, duration: 7000 });
    },
    [toast]
  );

  const warning = useCallback(
    (title: string, description?: string) => {
      toast({ type: "warning", title, description });
    },
    [toast]
  );

  const info = useCallback(
    (title: string, description?: string) => {
      toast({ type: "info", title, description });
    },
    [toast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, toast, dismiss, success, error, warning, info }}
    >
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ============================================
// Container
// ============================================

interface ToastContainerProps {
  toasts: Toast[];
  dismiss: (id: string) => void;
}

// SSR-safe mounted check (avoids hydration mismatch for portals)
function subscribe(_callback: () => void) {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function ToastContainer({ toasts, dismiss }: ToastContainerProps) {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>,
    document.body
  );
}

// ============================================
// Toast Item
// ============================================

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const iconColors: Record<ToastType, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-primary",
};

const borderColors: Record<ToastType, string> = {
  success: "border-l-success",
  error: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-primary",
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = icons[toast.type];

  return (
    <div
      className={cn(
        "flex w-80 items-start gap-3 rounded-lg border border-l-4 bg-card p-4 shadow-lg",
        borderColors[toast.type]
      )}
      style={{ animation: "toast-slide-in 200ms ease-out" }}
      role="alert"
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconColors[toast.type])} />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-sm text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================
// Simple toast function (for non-React contexts)
// ============================================

let toastFn: ToastContextType["toast"] | null = null;

export function setToastFunction(fn: ToastContextType["toast"]) {
  toastFn = fn;
}

export function showToast(options: Omit<Toast, "id">) {
  if (toastFn) {
    toastFn(options);
  } else {
    console.warn("Toast provider not initialized");
  }
}
