"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSpinner } from "@/components/ui/spinner";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { MailerLoginPage } from "../login-page";
import { FileText, Plus, Trash2 } from "lucide-react";

interface TemplateItem {
  id: string;
  name: string;
  category: string;
  subject: string;
  html: string;
  description?: string | null;
  builtIn: boolean;
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

export default function MailerTemplatesPage() {
  const { user, apiFetch } = useMailerAuth();
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/desktop/templates");
      if (!res.ok) throw new Error("Failed to load templates");
      const body = await res.json();
      setItems(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (user) {
      void loadTemplates();
    }
  }, [user, loadTemplates]);

  if (!user) return <MailerLoginPage />;

  function parseError(body: ApiErrorShape | null, fallback: string): string {
    const apiErr = body?.error;
    if (typeof apiErr === "string") return apiErr;
    if (typeof apiErr?.message === "string") return apiErr.message;
    if (typeof body?.message === "string") return body.message;
    return fallback;
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await apiFetch("/api/desktop/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          subject,
          html,
          description: description || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(parseError(body, "Failed to create template"));
      }

      setCreating(false);
      setName("");
      setCategory("custom");
      setSubject("");
      setHtml("");
      setDescription("");
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    setDeleteId(id);
    setError("");
    try {
      const res = await apiFetch(`/api/desktop/templates/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(parseError(body, "Failed to delete template"));
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable campaign templates (built-in and custom)
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No templates"
          description="Create your first reusable template."
          action={{ label: "Create template", onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="space-y-3">
          {items.map((tpl) => (
            <Card key={tpl.id} className="p-4" hover={false}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{tpl.name}</h3>
                    <Badge size="sm" variant={tpl.builtIn ? "secondary" : "default"}>
                      {tpl.builtIn ? "Built-in" : "Custom"}
                    </Badge>
                    <Badge size="sm" variant="outline">{tpl.category}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tpl.subject || "(No subject)"}</p>
                  {tpl.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{tpl.description}</p>
                  ) : null}
                </div>

                {!tpl.builtIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={deleteId === tpl.id}
                    onClick={() => deleteTemplate(tpl.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={creating} onClose={() => setCreating(false)}>
        <ModalContent size="lg">
          <ModalHeader>Create Template</ModalHeader>
          <form onSubmit={createTemplate}>
            <ModalBody>
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Template name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Category</span>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Subject</span>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">HTML body</span>
                  <Textarea
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    className="min-h-[220px] font-mono text-xs"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Description</span>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save template
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}

