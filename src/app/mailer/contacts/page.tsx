"use client";

import { useMailerAuth } from "@/lib/mailer-auth";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSpinner } from "@/components/ui/spinner";
import {
  ConfirmModal,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { MailerLoginPage } from "../login-page";
import { useTranslations } from "next-intl";

interface ContactList {
  id: string;
  name: string;
  columns: string[];
  emailColumn: string;
  contactCount: number;
  createdAt: string;
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export default function ContactsPage() {
  const { user, apiFetch } = useMailerAuth();
  const t = useTranslations("mailer");
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Upload state
  const [uploadListId, setUploadListId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      const res = await apiFetch("/api/desktop/contact-lists?limit=100");
      if (res.ok) {
        const data = await res.json();
        setLists(data.data ?? []);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (user) void loadLists();
  }, [user, loadLists]);

  const filteredLists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((list) => list.name.toLowerCase().includes(q));
  }, [lists, search]);

  if (!user) return <MailerLoginPage />;

  function getApiError(body: ApiErrorShape | null, fallback: string): string {
    const apiError = body?.error;
    if (typeof apiError === "string") return apiError;
    if (typeof apiError?.message === "string") return apiError.message;
    if (typeof body?.message === "string") return body.message;
    return fallback;
  }

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const res = await apiFetch("/api/desktop/contact-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
        throw new Error(getApiError(body, t("errors.createListFailed")));
      }

      setShowCreate(false);
      setCreateName("");
      await loadLists();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errors.createListFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload(listId: string) {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch(`/api/desktop/contact-lists/${listId}/contacts`, {
        method: "POST",
        body: formData,
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(getApiError(body as ApiErrorShape, t("errors.uploadFailed")));
      }

      setUploadResult(
        t("contacts.importedSummary", {
          imported: body.data.imported,
          duplicates: body.data.duplicatesSkipped ?? body.data.skippedDuplicates ?? 0,
        }),
      );
      setUploadListId(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadLists();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errors.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteListId) return;
    setDeleting(true);

    try {
      const res = await apiFetch(`/api/desktop/contact-lists/${deleteListId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        await loadLists();
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
      setDeleteListId(null);
    }
  }

  const hasLists = lists.length > 0;
  const hasFilters = search.trim() !== "";

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.description")}
        actions={
          <div
            className={
              hasLists
                ? "max-w-[220px] opacity-100 transition-[max-width,opacity] duration-200"
                : "pointer-events-none max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-200"
            }
            aria-hidden={!hasLists}
          >
            <Button
              size="md"
              onClick={() => setShowCreate(true)}
              leftIcon={<Plus className="h-4 w-4" />}
              tabIndex={hasLists ? undefined : -1}
            >
              {t("contacts.newListAction")}
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" onDismiss={() => setError("")} dismissLabel={t("actions.dismiss")}>
          {error}
        </Alert>
      )}
      {uploadResult && (
        <Alert variant="success" onDismiss={() => setUploadResult(null)} dismissLabel={t("actions.dismiss")}>
          {uploadResult}
        </Alert>
      )}

      {hasLists && (
        <Toolbar>
          <div className="relative w-full sm:max-w-xs">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("contacts.searchPlaceholder")}
              className="pl-10"
              aria-label={t("contacts.searchPlaceholder")}
            />
          </div>
          <ToolbarSpacer />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
              {t("actions.resetFilters")}
            </Button>
          )}
        </Toolbar>
      )}

      {loading ? (
        <SectionCard padded>
          <PageSpinner />
        </SectionCard>
      ) : !hasLists ? (
        <SectionCard padded={false} bodyClassName="p-5 sm:p-6">
          <EmptyState
            icon={<Users strokeWidth={1.8} />}
            title={t("contacts.noListsTitle")}
            description={t("contacts.noListsDescription")}
            action={{
              label: t("contacts.newListAction"),
              onClick: () => setShowCreate(true),
            }}
          />
        </SectionCard>
      ) : filteredLists.length === 0 ? (
        <SectionCard padded={false} bodyClassName="p-5 sm:p-6">
          <EmptyState
            icon={<Search strokeWidth={1.8} />}
            title={t("contacts.noResultsTitle")}
            description={t("contacts.noResultsDescription")}
            action={{ label: t("actions.resetFilters"), onClick: () => setSearch("") }}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,240px))] gap-4">
          {filteredLists.map((list) => {
            return (
              <div
                key={list.id}
                className="group flex min-h-[244px] w-[240px] flex-col rounded-[32px] border-2 border-slate-100 bg-white p-5 transition-all duration-250 hover:-translate-y-1 hover:border-indigo-600 hover:shadow-[0_20px_25px_-5px_rgba(79,70,229,0.10)] dark:border-[#30363D] dark:bg-[#161B22] dark:hover:border-primary/40"
              >
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <div className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-slate-950 dark:text-foreground">
                    {formatNumber(list.contactCount)}
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-[17px] font-bold leading-tight text-slate-950 dark:text-foreground">
                    {list.name}
                  </h3>
                  <p className="mt-1.5 max-w-full truncate text-[12px] font-medium text-slate-500 dark:text-muted-foreground">
                    {list.columns.length > 0
                      ? `${t("contacts.columnsPrefix")} ${list.columns.join(", ")}`
                      : t("contacts.contactsCount", { count: list.contactCount })}
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-slate-50 pt-4 dark:border-[#30363D]">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setUploadListId(list.id);
                      fileRef.current?.click();
                    }}
                    leftIcon={<Upload className="h-3.5 w-3.5" />}
                    className="h-9 min-h-9 w-full px-3 text-[12px]"
                  >
                    {t("contacts.uploadAction")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteListId(list.id)}
                    leftIcon={<Trash2 className="h-3.5 w-3.5 text-destructive" />}
                    className="h-9 min-h-9 w-full px-3 text-[12px] text-destructive hover:bg-destructive/5 hover:text-destructive"
                  >
                    {t("contacts.deleteAction")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={() => {
          if (uploadListId) void handleUpload(uploadListId);
        }}
      />

      {/* Create list modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <ModalContent size="sm">
          <ModalHeader>{t("contacts.newContactList")}</ModalHeader>
          <form onSubmit={handleCreateList}>
            <ModalBody>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">{t("contacts.listNameLabel")}</span>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t("contacts.listNamePlaceholder")}
                  required
                  autoFocus
                />
              </label>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" loading={creating}>
                {creating ? t("actions.creating") : t("actions.create")}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteListId}
        onClose={() => setDeleteListId(null)}
        onConfirm={handleDelete}
        title={t("contacts.deleteTitle")}
        description={t("contacts.deleteDescription")}
        confirmText={t("actions.delete")}
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
