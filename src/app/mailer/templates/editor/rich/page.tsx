"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ExternalLink, Save } from "lucide-react";
import { MailerLoginPage } from "../../../login-page";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

const DEFAULT_TEXT = "Hello,\n\nWrite your personal message here.\n\nBest,\nYour team";

function richTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;line-height:1.6;color:#111827;font-size:15px;font-family:Inter,Arial,sans-serif;">${escape(p).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;"><div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:8px;">${
    paragraphs || '<p style="color:#9ca3af;">Empty message</p>'
  }</div></body></html>`;
}

export default function MailerRichEditorPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer.templatesEditor");

  const [name, setName] = useState("Untitled Template");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user) return <MailerLoginPage />;

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const html = richTextToHtml(text);
      const res = await apiFetch("/api/desktop/editor-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: templateId ?? undefined,
          name,
          subject: subject.trim() ? subject.trim() : null,
          editorProjectJson: { kind: "rich", text },
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
      const html = richTextToHtml(text);
      const win = window.open("", "_blank");
      if (!win) throw new Error("Preview blocked by browser popup settings");
      win.document.open();
      win.document.write(html);
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
            href="/templates/editor"
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
            onClick={handlePreview}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1F2937] dark:hover:text-slate-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("preview")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving}
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

      <div className="flex flex-1 justify-center overflow-y-auto px-4 py-10 sm:px-8">
        <div className="w-full max-w-[720px] space-y-6">
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{t("subjectLabel")}</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="h-11 rounded-[14px] border-slate-200 bg-white text-[15px] dark:border-[#1F2937] dark:bg-[#161B22]"
            />
          </label>
          <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-[#1F2937] dark:bg-[#161B22] sm:p-12">
            <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {t("richEditor.title")}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("richEditor.placeholder")}
              className="block h-[60vh] w-full resize-none border-0 bg-transparent text-[16px] leading-[1.7] text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
          </div>
        </div>
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
