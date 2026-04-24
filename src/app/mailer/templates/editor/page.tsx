"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, ImageUp, Redo2, Save, Undo2 } from "lucide-react";
import { MailerLoginPage } from "../../login-page";
import { useMailerAuth } from "@/lib/mailer-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type GrapesEditor = {
  destroy: () => void;
  getProjectData: () => unknown;
  getHtml: () => string;
  runCommand: (name: string, options?: unknown) => unknown;
  on: (event: string, callback: (component?: unknown) => void) => void;
  off: (event: string, callback: (component?: unknown) => void) => void;
  getSelected: () => { getName?: () => string; get?: (key: string) => unknown } | null;
  AssetManager: {
    add: (asset: { src: string; type?: string; name?: string }) => void;
    getAll: () => Array<{ get: (key: string) => unknown }>;
  };
  DomComponents: {
    getType: (name: string) => {
      model?: {
        prototype?: {
          defaults?: {
            traits?: unknown[];
          };
        };
      };
    } | undefined;
    addType: (
      name: string,
      definition: {
        model: {
          extend: unknown;
          defaults: {
            traits: unknown[];
          };
        };
      },
    ) => void;
  };
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

type SelectedComponent = {
  getName?: () => string;
  get?: (key: string) => unknown;
  getAttributes?: () => Record<string, string>;
  addAttributes?: (attrs: Record<string, string>) => void;
};

interface EditorExportPayload {
  mjml?: string;
  html?: string;
}

interface UploadedAsset {
  url: string;
  name: string;
  size?: number;
  type?: string;
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

function parseCommandString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  const source = value as Record<string, unknown>;
  const candidates = ["mjml", "html", "code", "result"];
  for (const key of candidates) {
    const val = source[key];
    if (typeof val === "string") return val;
  }
  return undefined;
}

function buildExportFromCommands(editor: GrapesEditor): EditorExportPayload {
  const mjmlCommand = parseCommandString(editor.runCommand("mjml-code"));
  const mjmlSource = mjmlCommand?.trim() || parseEditorExport(editor.runCommand("mjml-export")).mjml || editor.getHtml();

  const htmlCommand = parseCommandString(editor.runCommand("mjml-code-to-html", { mjml: mjmlSource }));
  const htmlFromExport = parseEditorExport(editor.runCommand("mjml-export")).html;
  const htmlOutput = htmlCommand?.trim() || htmlFromExport?.trim();

  return {
    mjml: mjmlSource,
    html: htmlOutput,
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

function getSelectedComponentLabel(component: SelectedComponent | null): string {
  if (!component) return "No block selected";
  const explicitName = component.getName?.();
  const fallbackType = component.get?.("type");
  return explicitName || (typeof fallbackType === "string" ? fallbackType : "block");
}

function isImageComponent(component: SelectedComponent | null): boolean {
  if (!component) return false;
  const type = component.get?.("type");
  const name = component.getName?.();
  return (
    (typeof type === "string" && type.toLowerCase().includes("image")) ||
    (typeof name === "string" && name.toLowerCase().includes("image"))
  );
}

async function fetchEditorAssets(
  apiFetch: ReturnType<typeof useMailerAuth>["apiFetch"],
): Promise<UploadedAsset[]> {
  const res = await apiFetch("/api/desktop/editor-assets?limit=100");
  if (!res.ok) return [];
  const body = await res.json().catch(() => null) as { ok?: boolean; data?: UploadedAsset[] } | null;
  if (!body?.ok || !Array.isArray(body.data)) return [];
  return body.data.filter((item) => typeof item.url === "string");
}

export default function MailerTemplateEditorPage() {
  const { user, apiFetch } = useMailerAuth();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const blocksRef = useRef<HTMLDivElement | null>(null);
  const traitsRef = useRef<HTMLDivElement | null>(null);
  const stylesRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<GrapesEditor | null>(null);
  const selectedRef = useRef<SelectedComponent | null>(null);

  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageLink, setImageLink] = useState("");
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [selectedBlockLabel, setSelectedBlockLabel] = useState("No block selected");
  const [name, setName] = useState("Untitled MJML Template");
  const [subject, setSubject] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initEditor() {
      if (!user || !mountRef.current || !blocksRef.current || !traitsRef.current || !stylesRef.current) return;
      setInitializing(true);

      try {
        const [{ default: grapesjs }, { default: grapesjsMjml }] = await Promise.all([
          import("grapesjs"),
          import("grapesjs-mjml"),
        ]);

        if (cancelled || !mountRef.current) return;
        const existingAssets = await fetchEditorAssets(apiFetch);
        if (cancelled || !mountRef.current) return;

        const editor = grapesjs.init({
          container: mountRef.current,
          fromElement: false,
          height: "100%",
          storageManager: false,
          panels: { defaults: [] },
          blockManager: {
            appendTo: blocksRef.current,
          },
          traitManager: {
            appendTo: traitsRef.current,
          },
          styleManager: {
            appendTo: stylesRef.current,
            sectors: [
              {
                name: "Typography",
                open: true,
                buildProps: ["font-family", "font-size", "font-weight", "line-height", "text-align", "color"],
              },
              {
                name: "Spacing",
                open: true,
                buildProps: ["padding", "margin"],
              },
              {
                name: "Dimension",
                open: false,
                buildProps: ["width", "height"],
              },
              {
                name: "Decorations",
                open: false,
                buildProps: ["background-color", "border", "border-radius"],
              },
            ],
          },
          plugins: [grapesjsMjml],
          pluginsOpts: {
            "grapesjs-mjml": {
              useXmlParser: true,
            },
          },
          assetManager: {
            assets: existingAssets.map((item) => ({
              src: item.url,
              type: "image",
              name: item.name,
            })),
            upload: false,
            uploadName: "files",
            autoAdd: false,
            uploadFile: async (event: Event) => {
              const drag = event as DragEvent;
              const target = event.target as HTMLInputElement | null;
              const list = drag.dataTransfer?.files ?? target?.files;
              if (!list || list.length === 0) return;

              const formData = new FormData();
              for (const file of Array.from(list)) {
                formData.append("files", file);
              }

              const res = await apiFetch("/api/desktop/editor-assets", {
                method: "POST",
                body: formData,
              });
              const body = await res.json().catch(() => null) as {
                ok?: boolean;
                data?: UploadedAsset[];
                error?: { message?: string };
              } | null;
              if (!res.ok || !body?.ok || !Array.isArray(body.data)) {
                throw new Error(body?.error?.message || "Image upload failed");
              }

              for (const asset of body.data) {
                editor.AssetManager.add({
                  src: asset.url,
                  type: "image",
                  name: asset.name,
                });
              }
            },
          },
          components: DEFAULT_MJML_TEMPLATE,
        }) as unknown as GrapesEditor;

        const imageType = editor.DomComponents.getType("image");
        const imageModel = imageType?.model;
        if (imageModel) {
          const baseTraits = Array.isArray(imageModel.prototype?.defaults?.traits)
            ? imageModel.prototype?.defaults?.traits
            : [];
          editor.DomComponents.addType("image", {
            model: {
              extend: imageModel,
              defaults: {
                traits: [
                  ...baseTraits,
                  { type: "text", label: "Link URL", name: "href" },
                ],
              },
            },
          });
        }

        function syncSelectedComponent(component: SelectedComponent | null) {
          selectedRef.current = component;
          setSelectedBlockLabel(getSelectedComponentLabel(component));
          const imageSelected = isImageComponent(component);
          setIsImageSelected(imageSelected);

          if (!imageSelected || !component) {
            setImageUrl("");
            setImageAlt("");
            setImageLink("");
            return;
          }

          const attrs = component.getAttributes?.() || {};
          setImageUrl(attrs.src ?? "");
          setImageAlt(attrs.alt ?? "");
          setImageLink(attrs.href ?? "");
        }

        registerStarterBlocks(editor);
        const onSelected = (component?: unknown) => {
          const selected = (component as SelectedComponent | undefined) ?? (editor.getSelected() as SelectedComponent | null);
          syncSelectedComponent(selected);
        };
        const onDeselected = () => syncSelectedComponent(null);

        editor.on("component:selected", onSelected);
        editor.on("component:update", onSelected);
        editor.on("component:deselected", onDeselected);
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
      selectedRef.current = null;
    };
  }, [apiFetch, user]);

  if (!user) return <MailerLoginPage />;

  function runEditorCommand(name: string) {
    if (!editorRef.current) return;
    editorRef.current.runCommand(name);
  }

  function updateSelectedImageAttributes(next: Partial<Record<"src" | "alt" | "href", string>>) {
    const selected = selectedRef.current;
    if (!selected || !selected.addAttributes || !isImageComponent(selected)) return;
    const attrs = selected.getAttributes?.() || {};
    selected.addAttributes({ ...attrs, ...next });
  }

  async function uploadImages(files: FileList | File[]): Promise<UploadedAsset[]> {
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }

    const res = await apiFetch("/api/desktop/editor-assets", {
      method: "POST",
      body: formData,
    });

    const body = await res.json().catch(() => null) as {
      ok?: boolean;
      data?: UploadedAsset[];
      error?: { message?: string };
    } | null;
    if (!res.ok || !body?.ok || !Array.isArray(body.data)) {
      throw new Error(body?.error?.message || "Image upload failed");
    }
    return body.data;
  }

  async function handleImageUploadFromInput(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setImageUploading(true);
    setError("");

    try {
      const uploaded = await uploadImages(files);
      const editor = editorRef.current;
      if (!editor || uploaded.length === 0) return;

      for (const asset of uploaded) {
        editor.AssetManager.add({
          src: asset.url,
          type: "image",
          name: asset.name,
        });
      }

      const first = uploaded[0];
      setImageUrl(first.url);
      updateSelectedImageAttributes({ src: first.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setImageUploading(false);
      event.target.value = "";
    }
  }

  async function handleSave() {
    if (!editorRef.current) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const editor = editorRef.current;
      const editorProjectJson = editor.getProjectData();
      const exported = buildExportFromCommands(editor);
      const mjmlSource = exported.mjml || editor.getHtml();
      const htmlOutput = exported.html;
      if (!htmlOutput?.trim()) {
        throw new Error("Save failed: unable to generate HTML from MJML");
      }

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

  async function handlePreview() {
    const editor = editorRef.current;
    if (!editor) return;

    setError("");
    try {
      const exported = buildExportFromCommands(editor);
      const previewHtml = exported.html?.trim();
      if (!previewHtml?.trim()) {
        throw new Error("Preview failed: generated HTML is empty");
      }

      const previewWindow = window.open("", "_blank");
      if (!previewWindow) {
        throw new Error("Preview blocked by browser popup settings");
      }

      const documentHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Template Preview</title>
    <style>
      body { margin: 0; background: #f3f4f6; }
    </style>
  </head>
  <body>${previewHtml}</body>
</html>`;

      previewWindow.document.open();
      previewWindow.document.write(documentHtml);
      previewWindow.document.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed: unable to render HTML");
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
        <div className="grid border-b border-border bg-muted/20 px-3 py-2 md:grid-cols-[240px_minmax(0,1fr)_300px] md:items-center md:gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Starter blocks</p>
          <div className="flex flex-wrap items-center justify-start gap-2 py-2 md:justify-center md:py-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => runEditorCommand("core:undo")}
              disabled={initializing}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => runEditorCommand("core:redo")}
              disabled={initializing}
            >
              <Redo2 className="h-3.5 w-3.5" />
              Redo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void handlePreview()}
              disabled={initializing}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Preview
            </Button>
          </div>
          <p className="text-xs text-muted-foreground md:text-right">
            Selected: <span className="font-medium text-foreground">{selectedBlockLabel}</span>
          </p>
        </div>
        <div className="mjml-editor-shell grid h-[72vh] grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)_300px]">
          <aside className="border-b border-border bg-muted/20 md:border-b-0 md:border-r">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Blocks</p>
              <p className="text-xs text-muted-foreground">Drag and drop into the canvas.</p>
            </div>
            <div ref={blocksRef} className="h-[220px] overflow-y-auto p-2 md:h-[calc(72vh-56px)]" />
          </aside>
          <div className="relative h-[72vh] min-w-0 bg-slate-100/70">
            <div ref={mountRef} className="h-[72vh] min-w-0" />
          </div>
          <aside className="border-t border-border bg-muted/20 md:border-l md:border-t-0">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Block settings</p>
              <p className="text-xs text-muted-foreground">Edit selected block content and style.</p>
            </div>
            {isImageSelected ? (
              <div className="space-y-2 border-b border-border p-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Image</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    loading={imageUploading}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImageUp className="h-3.5 w-3.5" />
                    Upload
                  </Button>
                </div>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>Image URL</span>
                  <Input
                    value={imageUrl}
                    onChange={(e) => {
                      const value = e.target.value;
                      setImageUrl(value);
                      updateSelectedImageAttributes({ src: value });
                    }}
                    placeholder="https://..."
                    className="h-8 text-xs"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>Alt text</span>
                  <Input
                    value={imageAlt}
                    onChange={(e) => {
                      const value = e.target.value;
                      setImageAlt(value);
                      updateSelectedImageAttributes({ alt: value });
                    }}
                    placeholder="Describe image"
                    className="h-8 text-xs"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>Link URL</span>
                  <Input
                    value={imageLink}
                    onChange={(e) => {
                      const value = e.target.value;
                      setImageLink(value);
                      updateSelectedImageAttributes({ href: value });
                    }}
                    placeholder="https://example.com"
                    className="h-8 text-xs"
                  />
                </label>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(event) => void handleImageUploadFromInput(event)}
                />
              </div>
            ) : null}
            <div className="h-[240px] overflow-y-auto border-b border-border p-2 md:h-[calc((72vh-56px)/2)]">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</p>
              <div ref={traitsRef} />
            </div>
            <div className="h-[240px] overflow-y-auto p-2 md:h-[calc((72vh-56px)/2)]">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Style</p>
              <div ref={stylesRef} />
            </div>
          </aside>
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
        .mjml-editor-shell .gjs-pn-panels {
          display: none;
        }
        .mjml-editor-shell .gjs-cv-canvas {
          width: 100%;
          height: 100%;
          top: 0;
        }
        .mjml-editor-shell .gjs-editor,
        .mjml-editor-shell .gjs-cv-canvas {
          background: transparent;
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
        .mjml-editor-shell .gjs-block-category {
          border: 0;
          background: transparent;
          margin: 2px 0 0;
        }
        .mjml-editor-shell .gjs-title {
          border: 0;
          background: transparent;
          padding: 6px 4px;
          color: #6b7280;
        }
        .mjml-editor-shell .gjs-sm-sectors,
        .mjml-editor-shell .gjs-trt-traits {
          border: 0;
          background: transparent;
        }
        .mjml-editor-shell .gjs-trt-trait,
        .mjml-editor-shell .gjs-sm-sector {
          margin-bottom: 8px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #ffffff;
          padding: 8px;
        }
        .mjml-editor-shell .gjs-sm-properties {
          padding: 6px 0 0;
        }
        .mjml-editor-shell .gjs-sm-label {
          color: #6b7280;
          font-size: 12px;
          min-width: 90px;
        }
        .mjml-editor-shell .gjs-field,
        .mjml-editor-shell .gjs-clm-tags {
          border-radius: 8px;
          border: 1px solid #d1d5db;
          background: #ffffff;
        }
        .mjml-editor-shell .gjs-trt-trait .gjs-field {
          background: #ffffff;
          color: #111827;
        }
        .mjml-editor-shell .gjs-one-bg,
        .mjml-editor-shell .gjs-two-color,
        .mjml-editor-shell .gjs-three-bg {
          background: transparent;
          color: inherit;
        }
        .mjml-editor-shell .gjs-four-color,
        .mjml-editor-shell .gjs-color-warn,
        .mjml-editor-shell .gjs-color-highlight {
          color: inherit;
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
