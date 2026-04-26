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
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { MailerLoginPage } from "../login-page";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

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

  // Expand state
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ email: string; data: Record<string, string> }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

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

  async function toggleExpand(listId: string) {
    if (expandedList === listId) {
      setExpandedList(null);
      setContacts([]);
      return;
    }

    setExpandedList(listId);
    setContactsLoading(true);

    try {
      const res = await apiFetch(`/api/desktop/contact-lists/${listId}/contacts?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.data ?? []);
      }
    } catch {
      // ignore
    } finally {
      setContactsLoading(false);
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
          <Button
            size="md"
            onClick={() => setShowCreate(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("contacts.newListAction")}
          </Button>
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
        <div className="space-y-3">
          {filteredLists.map((list) => {
            const isExpanded = expandedList === list.id;
            return (
              <SectionCard key={list.id} padded bodyClassName="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => toggleExpand(list.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`list-${list.id}-contacts`}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
                        isExpanded
                          ? "bg-primary/10 text-primary ring-primary/15"
                          : "bg-muted text-muted-foreground ring-border group-hover:bg-foreground/5",
                      )}
                      aria-hidden
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
                      ) : (
                        <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-semibold tracking-tight text-foreground">
                        {list.name}
                      </h3>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {t("contacts.contactsCount", { count: list.contactCount })}
                        {list.columns.length > 0 && (
                          <>
                            <span className="mx-1.5 text-border">·</span>
                            <span className="truncate">
                              {t("contacts.columnsPrefix")} {list.columns.join(", ")}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setUploadListId(list.id);
                        fileRef.current?.click();
                      }}
                      leftIcon={<Upload className="h-3.5 w-3.5" />}
                    >
                      {t("contacts.uploadAction")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteListId(list.id)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5 text-destructive" />}
                      className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                    >
                      {t("contacts.deleteAction")}
                    </Button>
                  </div>
                </div>

                {/* Expanded contacts preview */}
                {isExpanded && (
                  <div id={`list-${list.id}-contacts`} className="mt-4 border-t border-border/60 pt-4">
                    {contactsLoading ? (
                      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                    ) : contacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("contacts.noContactsYet")}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                          <thead>
                            <tr className="border-b border-border/60 text-left text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              <th className="pb-2 pr-4">{t("contacts.columns.email")}</th>
                              {list.columns
                                .filter((c) => c.toLowerCase() !== list.emailColumn.toLowerCase())
                                .slice(0, 4)
                                .map((col) => (
                                  <th key={col} className="pb-2 pr-4">
                                    {col}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {contacts.map((contact, i) => (
                              <tr key={i}>
                                <td className="py-2 pr-4 font-medium text-foreground">
                                  {contact.email}
                                </td>
                                {list.columns
                                  .filter((c) => c.toLowerCase() !== list.emailColumn.toLowerCase())
                                  .slice(0, 4)
                                  .map((col) => (
                                    <td key={col} className="py-2 pr-4 text-muted-foreground">
                                      {contact.data?.[col] ?? "—"}
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {list.contactCount > 20 && (
                          <p className="mt-2 text-[12px] text-muted-foreground">
                            {t("contacts.showingOf", { shown: 20, total: list.contactCount })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
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
