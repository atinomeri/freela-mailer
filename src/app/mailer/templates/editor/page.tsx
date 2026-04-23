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
  BlockManager: {
    add: (
      id: string,
      options: {
        label: string;
        category: string;
        content: string;
      },
    ) => void;
    getAll: () => { reset: () => void };
    getCategories: () => {
      each: (callback: (category: { set: (key: string, value: boolean) => void }) => void) => void;
    };
  };
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

const STARTER_BLOCKS: Array<{
  id: string;
  label: string;
  category: string;
  content: string;
}> = [
  {
    id: "starter-text",
    label: "Text",
    category: "Content",
    content: `<mj-section padding="16px 20px">
  <mj-column>
    <mj-text font-size="16px" color="#111827" font-family="Arial, sans-serif">
      Write your message here.
    </mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-image",
    label: "Image",
    category: "Content",
    content: `<mj-section padding="16px 20px">
  <mj-column>
    <mj-image src="https://via.placeholder.com/600x240?text=Your+Image" alt="Image" />
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-button",
    label: "Button",
    category: "Content",
    content: `<mj-section padding="16px 20px">
  <mj-column>
    <mj-button background-color="#2563eb" color="#ffffff" border-radius="8px" font-size="15px">
      Call to action
    </mj-button>
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-divider",
    label: "Divider",
    category: "Content",
    content: `<mj-section padding="8px 20px">
  <mj-column>
    <mj-divider border-color="#e5e7eb" border-width="1px" />
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-spacer",
    label: "Spacer",
    category: "Content",
    content: `<mj-section padding="0 20px">
  <mj-column>
    <mj-spacer height="24px" />
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-columns-2",
    label: "2 Columns",
    category: "Layout",
    content: `<mj-section padding="16px 20px">
  <mj-column width="50%">
    <mj-text font-size="15px" color="#111827">Column 1</mj-text>
  </mj-column>
  <mj-column width="50%">
    <mj-text font-size="15px" color="#111827">Column 2</mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-columns-3",
    label: "3 Columns",
    category: "Layout",
    content: `<mj-section padding="16px 20px">
  <mj-column width="33.33%">
    <mj-text font-size="14px" color="#111827">Column 1</mj-text>
  </mj-column>
  <mj-column width="33.33%">
    <mj-text font-size="14px" color="#111827">Column 2</mj-text>
  </mj-column>
  <mj-column width="33.33%">
    <mj-text font-size="14px" color="#111827">Column 3</mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-header",
    label: "Header",
    category: "Sections",
    content: `<mj-section background-color="#111827" padding="20px">
  <mj-column>
    <mj-text align="center" font-size="20px" font-weight="700" color="#ffffff">
      Your brand name
    </mj-text>
  </mj-column>
</mj-section>`,
  },
  {
    id: "starter-footer",
    label: "Footer",
    category: "Sections",
    content: `<mj-section background-color="#f9fafb" padding="20px">
  <mj-column>
    <mj-text align="center" font-size="12px" color="#6b7280">
      You are receiving this email because you subscribed.
    </mj-text>
    <mj-text align="center" font-size="12px" color="#6b7280">
      Unsubscribe | Update preferences
    </mj-text>
  </mj-column>
</mj-section>`,
  },
];

function parseEditorExport(value: unknown): EditorExportPayload {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return {
    mjml: typeof source.mjml === "string" ? source.mjml : undefined,
    html: typeof source.html === "string" ? source.html : undefined,
  };
}

function registerStarterBlocks(editor: GrapesEditor) {
  const blockManager = editor.BlockManager;
  blockManager.getAll().reset();

  for (const block of STARTER_BLOCKS) {
    blockManager.add(block.id, {
      label: block.label,
      category: block.category,
      content: block.content,
    });
  }

  blockManager.getCategories().each((category) => {
    category.set("open", true);
  });
}

export default function MailerTemplateEditorPage() {
  const { user, apiFetch } = useMailerAuth();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const blocksRef = useRef<HTMLDivElement | null>(null);
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
      if (!user || !mountRef.current || !blocksRef.current) return;
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
          height: "100%",
          storageManager: false,
          blockManager: {
            appendTo: blocksRef.current,
          },
          plugins: [grapesjsMjml],
          pluginsOpts: {
            "grapesjs-mjml": {
              useXmlParser: true,
            },
          },
          components: DEFAULT_MJML_TEMPLATE,
        }) as unknown as GrapesEditor;

        registerStarterBlocks(editor);
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
            Phase 2 basics: edit with starter MJML blocks and save project JSON, MJML source, and rendered HTML.
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

      <Card className="relative overflow-hidden p-0">
        <div className="mjml-editor-shell grid h-[72vh] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-muted/20 md:border-b-0 md:border-r">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Starter blocks</p>
              <p className="text-xs text-muted-foreground">Drag into the canvas to build your email.</p>
            </div>
            <div ref={blocksRef} className="h-[220px] overflow-y-auto p-2 md:h-[calc(72vh-56px)]" />
          </aside>
          <div ref={mountRef} className="h-[72vh] min-w-0" />
        </div>
        {initializing ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            Loading editor...
          </div>
        ) : null}
      </Card>
      <style jsx global>{`
        .mjml-editor-shell .gjs-blocks-c {
          display: grid;
          gap: 8px;
        }
        .mjml-editor-shell .gjs-block {
          width: 100%;
          min-height: auto;
          margin: 0;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }
        .mjml-editor-shell .gjs-block:hover {
          border-color: #93c5fd;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
        }
        .mjml-editor-shell .gjs-block-label {
          font-size: 13px;
          padding: 10px 8px;
          color: #111827;
        }
        .mjml-editor-shell .gjs-sm-sector-title,
        .mjml-editor-shell .gjs-title {
          font-size: 12px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
