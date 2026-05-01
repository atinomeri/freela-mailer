"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Code2, Eye, EyeOff, ExternalLink, Save } from "lucide-react";
import { MailerLoginPage } from "../../../login-page";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const DEFAULT_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>New email</title>
  </head>
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:8px;">
      <h1 style="margin:0 0 12px 0;font-size:22px;color:#111827;">New email template</h1>
      <p style="margin:0;line-height:1.6;color:#4b5563;font-size:15px;">
        Start writing your email. The preview on the right updates as you type.
      </p>
    </div>
  </body>
</html>`;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export default function MailerCodeEditorPage() {
  return (
    <Suspense fallback={null}>
      <MailerCodeEditorPageInner />
    </Suspense>
  );
}

function MailerCodeEditorPageInner() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.templatesEditor");
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");

  const [name, setName] = useState("Untitled Template");
  const [source, setSource] = useState(DEFAULT_HTML);
  const [templateId, setTemplateId] = useState<string | null>(initialId);
  const [saving, setSaving] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(Boolean(initialId));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);

  const previewHtml = useDebounced(source, 200);

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
            name: string;
            editorProjectJson: { kind?: string; source?: string } | null;
            htmlOutput?: string;
          };
          error?: { message?: string };
        } | null;
        if (!body?.ok || !body.data) {
          throw new Error(body?.error?.message || "Failed to load template");
        }
        if (cancelled) return;
        setName(body.data.name || "Untitled Template");
        const savedSource =
          typeof body.data.editorProjectJson?.source === "string"
            ? body.data.editorProjectJson.source
            : body.data.htmlOutput;
        if (savedSource) setSource(savedSource);
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
  }, [user, initialId, apiFetch]);

  if (!user) return <MailerLoginPage />;

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!source.trim()) throw new Error("Save failed: HTML is empty");
      const res = await apiFetch("/api/desktop/editor-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: templateId ?? undefined,
          name,
          subject: null,
          editorProjectJson: { kind: "html", source },
          htmlOutput: source,
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
      setSuccess(
        `Template saved${body.data.updatedAt ? ` at ${new Date(body.data.updatedAt).toLocaleString()}` : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  function handlePreview() {
    setError("");
    try {
      if (!source.trim()) throw new Error("Preview failed: HTML is empty");
      const win = window.open("", "_blank");
      if (!win) throw new Error("Preview blocked by browser popup settings");
      win.document.open();
      win.document.write(source);
      win.document.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }

  return (
    <div className="editor-root flex h-dvh w-full flex-col bg-slate-50 font-sans antialiased dark:bg-[#0B0E11] animate-[fadeIn_180ms_ease-out]">
      <header className="sticky top-0 z-30 grid h-20 w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-100 bg-white px-4 dark:border-[#1F2937] dark:bg-[#161B22] sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/mailer/templates/editor"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1F2937] dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </div>

        <div className="flex min-w-0 items-center justify-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("templateNamePlaceholder")}
            className="h-9 w-[220px] min-w-0 rounded-lg border-0 bg-transparent px-3 text-center font-sans text-[14px] font-medium tracking-tight text-slate-900 transition-all duration-200 placeholder:text-slate-400 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:bg-[#1F2937] dark:focus:bg-[#1F2937] sm:w-[280px]"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-all duration-200",
              previewOpen
                ? "bg-slate-100 text-slate-900 dark:bg-[#1F2937] dark:text-slate-100"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1F2937] dark:hover:text-slate-100",
            )}
          >
            {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {t("preview")}
          </button>
          <button
            type="button"
            onClick={handlePreview}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1F2937] dark:hover:text-slate-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving || loadingTemplate}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(79,70,229,0.18)] transition-all duration-200 hover:bg-indigo-700 hover:shadow-[0_4px_12px_-2px_rgba(79,70,229,0.4)] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? `${t("save")}…` : t("save")}
          </button>
        </div>
      </header>

      {(error || success) && (
        <div className="w-full shrink-0 border-b border-slate-100 bg-white px-4 py-2 dark:border-[#1F2937] dark:bg-[#161B22] sm:px-6">
          {error ? <Alert variant="destructive" onDismiss={() => setError("")}>{error}</Alert> : null}
          {success ? <Alert variant="success" onDismiss={() => setSuccess("")}>{success}</Alert> : null}
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:p-6",
          previewOpen && "lg:grid-cols-2",
        )}
      >
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-slate-100 bg-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] dark:border-[#1F2937]">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Code2 className="h-3.5 w-3.5" />
              HTML
            </span>
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none border-0 bg-slate-950 p-5 font-mono text-[13px] leading-[1.65] text-slate-100 outline-none"
          />
        </div>

        {previewOpen && (
          <div className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] dark:border-[#1F2937] dark:bg-[#161B22]">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-[#1F2937] dark:bg-[#161B22] dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </span>
            </div>
            <iframe
              title="HTML preview"
              srcDoc={previewHtml}
              sandbox=""
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.99); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
