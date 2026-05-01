"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type React from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Save } from "lucide-react";
import type { EditorRef } from "react-email-editor";
import { MailerLoginPage } from "../../../login-page";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Alert } from "@/components/ui/alert";
import { useTranslations } from "next-intl";

// Unlayer embeds an iframe that touches `window` at module load — must be
// client-only. Guarded import keeps SSR / non-browser environments safe even
// if the dynamic() option were ever changed.
const EmailEditor = dynamic(
  () => {
    if (typeof window === "undefined") {
      return Promise.resolve(() => null) as unknown as Promise<
        typeof import("react-email-editor").default
      >;
    }
    console.log("[Unlayer] Script Loaded");
    return import("react-email-editor").then((mod) => mod.default);
  },
  { ssr: false },
);

type ExportHtmlData = { design: unknown; html: string };
type SaveDesignData = unknown;

const INDIGO_500 = "#6366F1";
const INDIGO_600 = "#4F46E5";

export default function MailerTemplateEditorPage() {
  return (
    <Suspense fallback={null}>
      <MailerTemplateEditorPageInner />
    </Suspense>
  );
}

function MailerTemplateEditorPageInner() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.templatesEditor");
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");

  const editorRef = useRef<EditorRef>(null);
  const pendingDesignRef = useRef<unknown | null>(null);
  const designLoadedRef = useRef(false);
  const [name, setName] = useState("Untitled Template");
  const [subject, setSubject] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(initialId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(Boolean(initialId));
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  // Sync Unlayer theme with our class-based dark mode (set on <html>).
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    console.log("[Unlayer] Mounting");
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Surface Unlayer / embed.js script-load failures (CSP, network, etc.) which
  // otherwise fail silently inside the dynamic component.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onScriptError(event: ErrorEvent) {
      const target = event.target as HTMLScriptElement | null;
      if (target?.src && target.src.includes("unlayer.com")) {
        console.error("[Unlayer] Script failed to load:", target.src, event.message);
      }
    }
    window.addEventListener("error", onScriptError, true);
    return () => window.removeEventListener("error", onScriptError, true);
  }, []);

  // Re-mounting the editor on theme change is the only reliable way to apply
  // a new appearance theme to Unlayer's free-tier iframe.
  const editorKey = `unlayer-${theme}`;

  const tryLoadPendingDesign = useCallback(() => {
    const unlayer = editorRef.current?.editor;
    const design = pendingDesignRef.current;
    if (!unlayer || !design || designLoadedRef.current) return;
    try {
      // Unlayer types JSONTemplate strictly; the saved design is opaque to us.
      (unlayer as unknown as { loadDesign: (d: unknown) => void }).loadDesign(design);
      designLoadedRef.current = true;
    } catch (err) {
      console.error("[Unlayer] loadDesign failed:", err);
    }
  }, []);

  // Fetch the saved template when ?id is in the URL (re-open / edit flow).
  useEffect(() => {
    if (!user || !initialId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/api/desktop/editor-templates/${encodeURIComponent(initialId)}`,
        );
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Template not found" : "Failed to load template",
          );
        }
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: {
            id: string;
            name: string;
            subject: string | null;
            editorProjectJson: { kind?: string; unlayerDesign?: unknown } | null;
          };
          error?: { message?: string };
        } | null;
        if (!body?.ok || !body.data) {
          throw new Error(body?.error?.message || "Failed to load template");
        }
        if (cancelled) return;
        setName(body.data.name || "Untitled Template");
        setSubject(body.data.subject ?? "");
        const design = body.data.editorProjectJson?.unlayerDesign;
        if (design) {
          pendingDesignRef.current = design;
          tryLoadPendingDesign();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load template");
        }
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, initialId, apiFetch, tryLoadPendingDesign]);

  if (!user) return <MailerLoginPage />;

  function exportHtml(): Promise<ExportHtmlData> {
    return new Promise((resolve, reject) => {
      const unlayer = editorRef.current?.editor;
      if (!unlayer) return reject(new Error("Editor not ready"));
      unlayer.exportHtml((data) => resolve(data as ExportHtmlData));
    });
  }

  function saveDesign(): Promise<SaveDesignData> {
    return new Promise((resolve, reject) => {
      const unlayer = editorRef.current?.editor;
      if (!unlayer) return reject(new Error("Editor not ready"));
      unlayer.saveDesign((design) => resolve(design));
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const [{ html }, design] = await Promise.all([exportHtml(), saveDesign()]);
      if (!html?.trim()) throw new Error("Save failed: editor produced empty HTML");

      const res = await apiFetch("/api/desktop/editor-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: templateId ?? undefined,
          name,
          subject: subject.trim() ? subject.trim() : null,
          editorProjectJson: { kind: "drag", unlayerDesign: design },
          htmlOutput: html,
        }),
      });

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { id?: string; updatedAt?: string };
        error?: { message?: string };
      } | null;

      if (!res.ok || !body?.ok || !body.data?.id) {
        throw new Error(body?.error?.message || "Failed to save template");
      }

      setTemplateId(body.data.id);
      setAutoSavedAt(new Date());
      setSuccess(
        `Template saved${
          body.data.updatedAt ? ` at ${new Date(body.data.updatedAt).toLocaleString()}` : ""
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setError("");
    // Open the popup synchronously inside the click handler so browsers don't
    // block it (Chrome drops the user-gesture token across awaits).
    const win = window.open("", "_blank");
    if (!win) {
      setError("Preview blocked by browser popup settings");
      return;
    }
    win.document.open();
    win.document.write(
      "<!doctype html><meta charset='utf-8'><title>Preview…</title><body style='font-family:system-ui;padding:24px;color:#475569;'>Generating preview…</body>",
    );
    win.document.close();
    try {
      const { html } = await exportHtml();
      if (!html?.trim()) throw new Error("Preview failed: generated HTML is empty");
      if (win.closed) return;
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      try {
        win.close();
      } catch {
        // ignore
      }
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }

  function handleEditorReady() {
    console.log("[Unlayer] Ready");
    const unlayer = editorRef.current?.editor;
    if (!unlayer) {
      console.error("[Unlayer] onReady fired but editorRef.current.editor is null");
      return;
    }
    setEditorReady(true);

    // Route the editor's image picker through our own asset endpoint so users
    // get persistent uploads tied to their account. Without this, Unlayer's
    // free tier silently drops uploads (no projectId configured).
    try {
      unlayer.registerCallback("image", async (data, done) => {
        try {
          const file = data.accepted?.[0] ?? data.attachments?.[0];
          if (!file) {
            done({ progress: 100 });
            return;
          }
          const formData = new FormData();
          formData.append("file", file);
          const res = await apiFetch("/api/desktop/editor-assets", {
            method: "POST",
            body: formData,
          });
          const body = (await res.json().catch(() => null)) as {
            ok?: boolean;
            data?: Array<{ url?: string }>;
            error?: { message?: string };
          } | null;
          if (!res.ok || !body?.ok || !body.data?.[0]?.url) {
            throw new Error(body?.error?.message || "Image upload failed");
          }
          done({ progress: 100, url: body.data[0].url });
        } catch (err) {
          console.error("[Unlayer] Image upload failed:", err);
          setError(err instanceof Error ? err.message : "Image upload failed");
          done({ progress: 100 });
        }
      });
    } catch (err) {
      console.error("[Unlayer] Failed to register image callback:", err);
    }

    // Apply any saved design we fetched before the editor was ready.
    tryLoadPendingDesign();

    // Emit a debounced auto-save indicator on every design change.
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      unlayer.addEventListener("design:updated", () => {
        setAutoSaving(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          setAutoSaving(false);
          setAutoSavedAt(new Date());
        }, 800);
      });
    } catch (err) {
      console.error("[Unlayer] Failed to register design:updated listener:", err);
    }
  }

  function handleEditorLoad() {
    console.log("[Unlayer] onLoad fired (editor instance attaching)");
  }

  return (
    <div className="editor-root flex h-dvh w-full flex-col bg-slate-50 font-sans antialiased dark:bg-[#0B0E11] animate-[fadeIn_180ms_ease-out]">
      <header className="sticky top-0 z-30 grid h-20 w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-100 bg-white px-4 dark:border-[#1F2937] dark:bg-[#161B22] sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/mailer/templates/editor"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1F2937] dark:hover:text-slate-100"
            aria-label="Back to chooser"
            title="Back to chooser"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("templateNamePlaceholder")}
            className="h-9 w-[220px] min-w-0 rounded-lg border-0 bg-transparent px-3 text-center font-sans text-[14px] font-medium tracking-tight text-slate-900 transition-all duration-200 placeholder:text-slate-400 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:bg-[#1F2937] dark:focus:bg-[#1F2937] sm:w-[280px]"
          />
          <AutoSaveIndicator saving={autoSaving} savedAt={autoSavedAt} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={!editorReady || loadingTemplate}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-[#1F2937] dark:hover:text-slate-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("preview")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!editorReady || !name.trim() || saving || loadingTemplate}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(79,70,229,0.18)] transition-all duration-200 hover:bg-indigo-700 hover:shadow-[0_4px_12px_-2px_rgba(79,70,229,0.4)] disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:hover:shadow-[0_1px_2px_rgba(79,70,229,0.18)]"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? `${t("save")}…` : t("save")}
          </button>
        </div>
      </header>

      {(error || success) && (
        <div className="w-full shrink-0 border-b border-slate-100 bg-white px-4 py-2 dark:border-[#1F2937] dark:bg-[#161B22] sm:px-6">
          {error ? (
            <Alert variant="destructive" onDismiss={() => setError("")}>{error}</Alert>
          ) : null}
          {success ? (
            <Alert variant="success" onDismiss={() => setSuccess("")}>{success}</Alert>
          ) : null}
        </div>
      )}

      <div
        className="relative flex min-h-0 w-full flex-1 justify-center bg-slate-50 p-4 dark:bg-[#0B0E11] sm:p-6"
        style={{ height: "calc(100vh - 80px)" }}
      >
        <div className="flex w-full max-w-[1400px] flex-1 overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 dark:border-[#1F2937] dark:bg-[#161B22] dark:ring-[#1F2937]">
          <EmailEditor
            key={editorKey}
            ref={editorRef}
            minHeight="100%"
            onReady={handleEditorReady}
            onLoad={handleEditorLoad}
            options={unlayerOptions(theme)}
          />
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.99); }
          to   { opacity: 1; transform: scale(1); }
        }
        .editor-root {
          font-family: var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
        /* Make sure Unlayer's iframe fills our rounded card. */
        .editor-root iframe {
          border: 0;
          border-radius: inherit;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

// Unlayer's TS types lag behind runtime — `bodyValues` and a few tool keys
// are accepted at runtime but not declared. Widen here so the page stays typed.
function unlayerOptions(theme: "light" | "dark") {
  return {
    displayMode: "email" as const,
    appearance: {
      theme: theme === "dark" ? "modern_dark" : "modern_light",
      panels: { tools: { dock: "left" } },
      features: { preview: true },
    },
    features: {
      textEditor: { spellChecker: true },
    },
    fonts: {
      showDefaultFonts: true,
      customFonts: [
        {
          label: "Inter",
          value: "'Inter', ui-sans-serif, system-ui, sans-serif",
          url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
        },
      ],
    },
    bodyValues: {
      fontFamily: {
        label: "Inter",
        value: "'Inter', ui-sans-serif, system-ui, sans-serif",
      },
      contentWidth: "640px",
      backgroundColor: theme === "dark" ? "#0B0E11" : "#F8FAFC",
    },
    tools: {
      button: {
        properties: {
          buttonColors: {
            value: {
              color: "#FFFFFF",
              backgroundColor: INDIGO_600,
              hoverColor: "#FFFFFF",
              hoverBackgroundColor: INDIGO_500,
            },
          },
          borderRadius: { value: "12px" },
        },
      },
    },
  } as unknown as React.ComponentProps<typeof EmailEditor>["options"];
}

function AutoSaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: Date | null }) {
  const t = useTranslations("mailer.templatesEditor");
  if (saving) {
    return (
      <span className="ml-2 hidden items-center gap-1.5 text-[11.5px] font-medium text-slate-400 dark:text-slate-500 sm:inline-flex">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
        </span>
        {t("autoSaving")}
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="ml-2 hidden items-center gap-1.5 text-[11.5px] font-medium text-slate-400 dark:text-slate-500 sm:inline-flex">
        <Check className="h-3 w-3 text-emerald-500" />
        {t("savedAt", { time: savedAt.toLocaleTimeString() })}
      </span>
    );
  }
  return null;
}
