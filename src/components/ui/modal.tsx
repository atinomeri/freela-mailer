"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Modal Context
// ============================================

interface ModalContextType {
  isOpen: boolean;
  onClose: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

function useModalContext() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("Modal components must be used within a Modal");
  }
  return context;
}

// ============================================
// Modal Root
// ============================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <ModalContext.Provider value={{ isOpen, onClose }}>
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        style={{ animation: "modal-overlay-in 150ms ease-out" }}
      >
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        {/* Content */}
        {children}
      </div>
    </ModalContext.Provider>,
    document.body
  );
}

// ============================================
// Modal Content
// ============================================

interface ModalContentProps {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-4xl",
};

export function ModalContent({ children, className, size = "md" }: ModalContentProps) {
  return (
    <div
      className={cn(
        "relative z-10 w-full rounded-xl border border-border bg-card shadow-xl",
        sizeClasses[size],
        className
      )}
      style={{ animation: "modal-content-in 200ms ease-out" }}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}

// ============================================
// Modal Header
// ============================================

interface ModalHeaderProps {
  children: ReactNode;
  className?: string;
  showClose?: boolean;
}

export function ModalHeader({ children, className, showClose = true }: ModalHeaderProps) {
  const { onClose } = useModalContext();

  return (
    <div className={cn("flex items-center justify-between border-b border-border px-6 py-4", className)}>
      <div className="text-lg font-semibold">{children}</div>
      {showClose && (
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
    </div>
  );
}

// ============================================
// Modal Body
// ============================================

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}

// ============================================
// Modal Footer
// ============================================

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={cn("flex items-center justify-end gap-3 border-t border-border px-6 py-4", className)}>
      {children}
    </div>
  );
}

// ============================================
// Confirm Modal
// ============================================

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent size="sm">
        <ModalHeader showClose={false}>{title}</ModalHeader>
        {description && (
          <ModalBody>
            <p className="text-sm text-muted-foreground">{description}</p>
          </ModalBody>
        )}
        <ModalFooter>
          <button
            onClick={onClose}
            disabled={loading}
            className="h-10 rounded-lg px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-10 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50",
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {loading ? "Loading..." : confirmText}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
