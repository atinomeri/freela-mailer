"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSpinner } from "@/components/ui/spinner";
import {
  ConfirmModal,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import { MailerLoginPage } from "../login-page";
import {
  ArrowRight,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("mailer");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/desktop/templates");
      if (!res.ok) throw new Error(t("templates.loadFailed"));
      const body = await res.json();
      setItems(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("templates.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, t]);

  useEffect(() => {
    if (user) void loadTemplates();
  }, [user, loadTemplates]);

  const { customTemplates, starterTemplates } = useMemo(() => {
    return {
      customTemplates: items.filter((tpl) => !tpl.builtIn),
      starterTemplates: items.filter((tpl) => tpl.builtIn),
    };
  }, [items]);

  if (!user) return <MailerLoginPage />;

  function parseError(body: ApiErrorShape | null, fallback: string): string {
    const apiErr = body?.error;
    if (typeof apiErr === "string") return apiErr;
    if (typeof apiErr?.message === "string") return apiErr.message;
    if (typeof body?.message === "string") return body.message;
    return fallback;
  }

  function openCreateModal() {
    setEditingId(null);
    setName("");
    setCategory("custom");
    setSubject("");
    setHtml("");
    setDescription("");
    setEditorOpen(true);
  }

  function openEditModal(template: TemplateItem) {
    setEditingId(template.id);
    setName(template.name);
    setCategory(template.category);
    setSubject(template.subject);
    setHtml(template.html);
    setDescription(template.description ?? "");
    setEditorOpen(true);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const endpoint = editingId
        ? `/api/desktop/templates/${editingId}`
        : "/api/desktop/templates";
      const method = editingId ? "PATCH" : "POST";

      const res = await apiFetch(endpoint, {
        method,
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
        throw new Error(
          parseError(
            body,
            editingId ? t("templates.updateFailed") : t("templates.createFailed"),
          ),
        );
      }

      setEditorOpen(false);
      setEditingId(null);
      await loadTemplates();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingId
            ? t("templates.updateFailed")
            : t("templates.createFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    setDeleteId(confirmDeleteId);
    setError("");
    try {
      const res = await apiFetch(`/api/desktop/templates/${confirmDeleteId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(parseError(body, t("templates.deleteFailed")));
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("templates.deleteFailed"));
    } finally {
      setDeleteId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      <PageHeader
        title={t("templates.title")}
        description={t("templates.description")}
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href="/templates/editor" variant="secondary" size="md">
              {t("templates.openEditor")}
            </ButtonLink>
            <Button size="md" onClick={openCreateModal} leftIcon={<Plus className="h-4 w-4" />}>
              {t("templates.newTemplate")}
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" onDismiss={() => setError("")} dismissLabel={t("actions.dismiss")}>
          {error}
        </Alert>
      )}

      {loading ? (
        <SectionCard padded>
          <PageSpinner />
        </SectionCard>
      ) : items.length === 0 ? (
        <SectionCard padded={false} bodyClassName="p-5 sm:p-6">
          <EmptyState
            icon={<FileText strokeWidth={1.8} />}
            title={t("templates.noTemplatesAtAll")}
            description={t("templates.noTemplatesAtAllDescription")}
            action={{ label: t("templates.newTemplate"), onClick: openCreateModal }}
          />
        </SectionCard>
      ) : (
        <div className="space-y-6 lg:space-y-8">
          {/* My templates */}
          <SectionCard
            title={t("templates.myTemplatesTitle")}
            description={t("templates.myTemplatesDescription")}
            padded={false}
            bodyClassName="p-4 sm:p-5"
          >
            {customTemplates.length === 0 ? (
              <EmptyState
                icon={<FileText strokeWidth={1.8} />}
                title={t("templates.noCustomTitle")}
                description={t("templates.noCustomDescription")}
                action={{ label: t("templates.newTemplate"), onClick: openCreateModal }}
                className="border-0 bg-transparent"
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {customTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    isStarter={false}
                    onEdit={() => openEditModal(tpl)}
                    onDelete={() => setConfirmDeleteId(tpl.id)}
                    deleting={deleteId === tpl.id}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Starter templates */}
          {starterTemplates.length > 0 && (
            <SectionCard
              title={
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" strokeWidth={2.2} />
                  {t("templates.starterTemplatesTitle")}
                </span>
              }
              description={t("templates.starterTemplatesDescription")}
              padded={false}
              bodyClassName="p-4 sm:p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {starterTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    isStarter
                    onEdit={undefined}
                    onDelete={undefined}
                    deleting={false}
                  />
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)}>
        <ModalContent size="lg">
          <ModalHeader>
            {editingId ? t("templates.editTitle") : t("templates.createTitle")}
          </ModalHeader>
          <form onSubmit={saveTemplate}>
            <ModalBody>
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("templates.fields.name")}</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("templates.fields.category")}</span>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("templates.fields.subject")}</span>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("templates.fields.html")}</span>
                  <Textarea
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    className="min-h-[220px] font-mono text-xs"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("templates.fields.description")}</span>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? t("templates.update") : t("templates.save")}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={confirmDelete}
        title={t("templates.deleteConfirmTitle")}
        description={t("templates.deleteConfirmDescription")}
        confirmText={t("templates.delete")}
        variant="destructive"
        loading={deleteId === confirmDeleteId}
      />
    </div>
  );
}

function TemplateCard({
  template,
  isStarter,
  onEdit,
  onDelete,
  deleting,
}: {
  template: TemplateItem;
  isStarter: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting: boolean;
}) {
  const t = useTranslations("mailer");
  return (
    <div
      className={cn(
        "group flex flex-col rounded-2xl border border-border/70 bg-card",
        "shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
        "transition-colors hover:border-foreground/15",
      )}
    >
      <div className="aspect-[16/9] overflow-hidden rounded-t-2xl border-b border-border/60 bg-[hsl(var(--muted)/0.5)]">
        <TemplatePreview html={template.html} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-tight text-foreground">
              {template.name}
            </h3>
            {isStarter && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary">
                <Sparkles className="h-3 w-3" />
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
            {template.subject || t("templates.noSubject")}
          </p>
          {template.description && (
            <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
              {template.description}
            </p>
          )}
        </div>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-2 border-t border-border/60 pt-3">
            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onEdit}
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
                className="flex-1"
              >
                {t("templates.edit")}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                loading={deleting}
                disabled={deleting}
                leftIcon={<Trash2 className="h-3.5 w-3.5 text-destructive" />}
                className="text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                {t("templates.delete")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatePreview({ html }: { html: string }) {
  if (!html.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <FileText className="h-8 w-8" strokeWidth={1.5} />
      </div>
    );
  }
  // Render the template HTML at a small scale as a visual preview.
  // Sanitization note: templates come from the same workspace's authenticated API;
  // we render in a no-pointer container, never executing scripts on the user's behalf.
  return (
    <div
      className="pointer-events-none h-full w-full origin-top-left scale-[0.45] overflow-hidden bg-white p-4 text-foreground"
      style={{ width: "222%", height: "222%" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
