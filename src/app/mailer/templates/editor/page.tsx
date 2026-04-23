"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { MailerLoginPage } from "../../login-page";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type GrapesEditor = {
  destroy: () => void;
  getProjectData: () => unknown;
  getHtml: () => string;
  runCommand: (name: string) => unknown;
};

interface EditorExportPayload {
  mjml?: string;
  html?: string;
}

const DEFAULT_MJML_TEMPLATE = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="24px 20px">
      <mj-column>
        <mj-text font-size="24px" font-family="Arial, sans-serif" color="#111827">
          New email template
        </mj-text>
        <mj-text font-size="15px" font-family="Arial, sans-serif" color="#4b5563">
          Start editing this blank MJML template.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

function parseEditorExport(value: unknown): EditorExportPayload {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return {
    mjml: typeof source.mjml === "string" ? source.mjml : undefined,
    html: typeof source.html === "string" ? source.html : undefined,
  };
}

export default function MailerTemplateEditorPage() {
  const { user, apiFetch } = useMailerAuth();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<GrapesEditor | null>(null);

  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("Untitled MJML Template");
  const [subject, setSubject] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initEditor() {
      if (!user || !mountRef.current) return;
      setInitializing(true);

      try {
        const [{ default: grapesjs }, { default: grapesjsMjml }] = await Promise.all([
          import("grapesjs"),
          import("grapesjs-mjml"),
        ]);

        if (cancelled || !mountRef.current) return;

        const editor = grapesjs.init({
          container: mountRef.current,
          fromElement: false,
          height: "70vh",
          storageManager: false,
          plugins: [grapesjsMjml],
          pluginsOpts: {
            "grapesjs-mjml": {
              useXmlParser: true,
            },
          },
          components: DEFAULT_MJML_TEMPLATE,
        }) as unknown as GrapesEditor;

        editorRef.current = editor;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize editor");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    void initEditor();

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [user]);

  if (!user) return <MailerLoginPage />;

  async function handleSave() {
    if (!editorRef.current) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const editor = editorRef.current;
      const editorProjectJson = editor.getProjectData();

      const exported = parseEditorExport(editor.runCommand("mjml-export"));
      const mjmlSource = exported.mjml || editor.getHtml();
      const htmlOutput = exported.html || editor.getHtml();

      const res = await apiFetch("/api/desktop/editor-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: templateId ?? undefined,
          name,
          subject: subject.trim() ? subject.trim() : null,
          editorProjectJson,
          mjmlSource,
          htmlOutput,
        }),
      });

      const body = await res.json().catch(() => null) as {
        ok?: boolean;
        data?: { id?: string; updatedAt?: string };
        error?: { message?: string };
      } | null;

      if (!res.ok || !body?.ok || !body.data?.id) {
        throw new Error(body?.error?.message || "Failed to save template");
      }

      setTemplateId(body.data.id);
      setSuccess(`Template saved${body.data.updatedAt ? ` at ${new Date(body.data.updatedAt).toLocaleString()}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Template Editor (MJML)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phase 1: create and save GrapesJS project JSON, MJML source, and rendered HTML.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/templates">
            <ArrowLeft className="h-4 w-4" />
            Back to templates
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Template name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My MJML template" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Subject (optional)</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          </label>
          <Button onClick={() => void handleSave()} loading={saving} disabled={initializing || !name.trim()}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="mt-3 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
            {success}
          </p>
        ) : null}
      </Card>

      <Card className="p-0 overflow-hidden">
        {initializing ? (
          <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
            Loading editor...
          </div>
        ) : (
          <div ref={mountRef} className="h-[70vh]" />
        )}
      </Card>
    </div>
  );
}
