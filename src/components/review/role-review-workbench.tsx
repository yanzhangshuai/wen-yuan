"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  Trash2
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import {
  createBookPersona,
  fetchBookPersonas,
  type BookPersonaListItem
} from "@/lib/services/books";
import {
  deletePersona,
  fetchPersonaDetail,
  fetchPersonaDeletePreview,
  patchPersona,
  type PersonaDeletePreview
} from "@/lib/services/personas";
import {
  createRelationship,
  patchRelationship
} from "@/lib/services/relationships";
import {
  createBiography,
  deleteBiography,
  patchBiography
} from "@/lib/services/biography";
import {
  confirmAliasMapping,
  createAliasMapping,
  rejectAliasMapping,
  type AliasMappingItem
} from "@/lib/services/alias-mappings";
import {
  fetchChapterEventChapters,
  type ChapterEventChapter,
  type DraftsData
} from "@/lib/services/role-workbench";
import type { PersonaDetail } from "@/types/graph";

import { RoleReviewSidebar } from "./role-review-sidebar";
import {
  ImpactCount,
  ImpactDetails,
  RoleAliasesSection,
  RoleBasicsSection,
  RoleBiographiesSection,
  RoleRelationshipsSection
} from "./role-review-sections";
import {
  AliasFields,
  BiographyFields,
  getSheetDescription,
  getSheetTitle,
  PersonaFields,
  RelationshipFields
} from "./role-review-sheet-fields";
import {
  biographyFromTimeline,
  collectRoleFirstAppearanceChapters,
  collectChapterOptions,
  emptyAliasForm,
  emptyBiographyForm,
  emptyPersonaForm,
  getDefaultChapterId,
  personaFormFromRow,
  relationshipFromDetail,
  roleMatchesFilter,
  roleMatchesQuery,
  sortRoles,
  sourceLabel,
  toPersonaBody,
  WORKSPACE_TABS,
  type AliasFormState,
  type BiographyFormState,
  type ChapterOption,
  type PendingCounts,
  type PersonaFormState,
  type RelationshipFormState,
  type RoleBiographyItem,
  type RoleListFilter,
  type RoleRelationshipItem,
  type RoleSortMode,
  type SheetMode,
  type WorkspaceTab
} from "./role-review-utils";

interface RoleReviewWorkbenchProps {
  bookId          : string;
  drafts          : DraftsData;
  aliasMappings   : AliasMappingItem[];
  onRefreshDrafts : () => void;
  onRefreshAliases: () => void;
}

export function RoleReviewWorkbench({
  bookId,
  drafts,
  aliasMappings,
  onRefreshDrafts,
  onRefreshAliases
}: RoleReviewWorkbenchProps) {
  const [personas, setPersonas] = useState<BookPersonaListItem[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleListFilter>("all");
  const [sortMode, setSortMode] = useState<RoleSortMode>("appearance");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("basics");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [personaEditorMode, setPersonaEditorMode] = useState<"create" | "edit" | null>(null);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [pendingRoleSwitch, setPendingRoleSwitch] = useState<string | null>(null);
  const [showDirtyGuard, setShowDirtyGuard] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<RoleRelationshipItem | null>(null);
  const [editingBiography, setEditingBiography] = useState<RoleBiographyItem | null>(null);
  const [personaForm, setPersonaForm] = useState<PersonaFormState>(emptyPersonaForm);
  const [relationshipForm, setRelationshipForm] = useState<RelationshipFormState>({
    targetId  : "",
    type      : "",
    weight    : "1",
    evidence  : "",
    confidence: "100",
    chapterId : ""
  });
  const [biographyForm, setBiographyForm] = useState<BiographyFormState>(emptyBiographyForm);
  const [aliasForm, setAliasForm] = useState<AliasFormState>(emptyAliasForm);
  const [deleteTarget, setDeleteTarget] = useState<BookPersonaListItem | null>(null);
  const [deletePreview, setDeletePreview] = useState<PersonaDeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [personaDetail, setPersonaDetail] = useState<PersonaDetail | null>(null);
  const [chapterSummaries, setChapterSummaries] = useState<ChapterOption[]>([]);

  const pendingCounts = useMemo(() => {
    const counts = new Map<string, PendingCounts>();
    for (const persona of personas) {
      counts.set(persona.id, { relationships: 0, biographies: 0, aliases: 0 });
    }
    for (const relationship of drafts.relationships) {
      const source = counts.get(relationship.sourcePersonaId);
      if (source) source.relationships += 1;
      const target = counts.get(relationship.targetPersonaId);
      if (target && relationship.targetPersonaId !== relationship.sourcePersonaId) target.relationships += 1;
    }
    for (const biography of drafts.biographyRecords) {
      const count = counts.get(biography.personaId);
      if (count) count.biographies += 1;
    }
    for (const mapping of aliasMappings) {
      if (mapping.status !== "PENDING" || !mapping.personaId) continue;
      const count = counts.get(mapping.personaId);
      if (count) count.aliases += 1;
    }
    return counts;
  }, [personas, drafts, aliasMappings]);

  const firstAppearanceChapters = useMemo(() => {
    return collectRoleFirstAppearanceChapters(drafts, aliasMappings);
  }, [drafts, aliasMappings]);

  const visibleRoles = useMemo(() => {
    return sortRoles(
      personas.filter(persona => roleMatchesFilter(persona, roleFilter) && roleMatchesQuery(persona, query)),
      sortMode,
      firstAppearanceChapters
    );
  }, [personas, roleFilter, query, sortMode, firstAppearanceChapters]);

  const selectedPersona = personas.find(persona => persona.id === selectedPersonaId) ?? visibleRoles[0] ?? personas[0] ?? null;

  const selectedRelationships = useMemo(() => {
    if (!selectedPersona) return [];
    if (personaDetail?.id === selectedPersona.id) {
      return personaDetail.relationships
        .filter(relationship => relationship.bookId === bookId)
        .map(relationship => relationshipFromDetail(relationship, selectedPersona));
    }
    return drafts.relationships.filter(relationship =>
      relationship.sourcePersonaId === selectedPersona.id || relationship.targetPersonaId === selectedPersona.id
    );
  }, [bookId, drafts.relationships, personaDetail, selectedPersona]);

  const selectedBiographies = useMemo(() => {
    if (!selectedPersona) return [];
    if (personaDetail?.id === selectedPersona.id) {
      return personaDetail.timeline
        .filter(event => event.bookId === bookId)
        .map(event => biographyFromTimeline(event, selectedPersona));
    }
    return drafts.biographyRecords
      .filter(biography => biography.personaId === selectedPersona.id)
      .sort((left, right) => left.chapterNo - right.chapterNo);
  }, [bookId, drafts.biographyRecords, personaDetail, selectedPersona]);

  const selectedAliases = useMemo(() => {
    if (!selectedPersona) return [];
    return aliasMappings.filter(mapping => mapping.personaId === selectedPersona.id);
  }, [aliasMappings, selectedPersona]);

  const chapterOptions = useMemo(() => {
    return collectChapterOptions(drafts, selectedRelationships, selectedBiographies, chapterSummaries);
  }, [drafts, selectedRelationships, selectedBiographies, chapterSummaries]);

  const defaultChapterId = getDefaultChapterId(chapterOptions);

  const loadPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBookPersonas(bookId);
      setPersonas(rows);
      setSelectedPersonaId((prev) => {
        if (prev && rows.some(row => row.id === prev)) return prev;
        return sortRoles(rows, "appearance", firstAppearanceChapters)[0]?.id ?? null;
      });
    } catch {
      setError("角色列表加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [bookId, firstAppearanceChapters]);

  const loadChapters = useCallback(async () => {
    try {
      const data = await fetchChapterEventChapters(bookId);
      setChapterSummaries(data.chapters.map((chapter: ChapterEventChapter) => ({
        id   : chapter.id,
        no   : chapter.no,
        title: chapter.title || chapter.noText
      })));
    } catch {
      setChapterSummaries([]);
    }
  }, [bookId]);

  const loadPersonaDetail = useCallback(async (personaId: string) => {
    setError(null);
    try {
      const detail = await fetchPersonaDetail(personaId);
      setPersonaDetail(detail);
    } catch {
      setPersonaDetail(null);
      setError("角色详情加载失败，暂时仅显示待确认草稿。");
    }
  }, []);

  useEffect(() => {
    void loadPersonas();
  }, [loadPersonas]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  useEffect(() => {
    if (!selectedPersonaId) {
      setPersonaDetail(null);
      return;
    }
    let cancelled = false;
    setPersonaDetail(null);
    void fetchPersonaDetail(selectedPersonaId)
      .then((detail) => {
        if (!cancelled) setPersonaDetail(detail);
      })
      .catch(() => {
        if (!cancelled) {
          setPersonaDetail(null);
          setError("角色详情加载失败，暂时仅显示待确认草稿。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPersonaId]);

  function markDirty() {
    setSheetDirty(true);
  }

  function closeSheet() {
    setSheetMode(null);
    setSheetDirty(false);
    setEditingRelationship(null);
    setEditingBiography(null);
  }

  function closePersonaEditor() {
    setPersonaEditorMode(null);
    setSheetDirty(false);
  }

  function hasDirtyEditor() {
    return sheetDirty && (sheetMode !== null || personaEditorMode !== null);
  }

  function requestSheetClose(open: boolean) {
    if (open) return;
    if (hasDirtyEditor()) {
      setShowDirtyGuard(true);
      return;
    }
    closeSheet();
  }

  function selectRole(personaId: string) {
    if (hasDirtyEditor()) {
      setPendingRoleSwitch(personaId);
      setShowDirtyGuard(true);
      return;
    }
    setSelectedPersonaId(personaId);
  }

  function discardDirtyChanges() {
    const nextPersonaId = pendingRoleSwitch;
    closeSheet();
    closePersonaEditor();
    setShowDirtyGuard(false);
    setPendingRoleSwitch(null);
    if (nextPersonaId) setSelectedPersonaId(nextPersonaId);
  }

  function openPersonaCreate() {
    setPersonaForm(emptyPersonaForm);
    setSheetDirty(false);
    setSheetMode(null);
    setPersonaEditorMode("create");
    setActiveTab("basics");
  }

  function openPersonaEdit() {
    if (!selectedPersona) return;
    setPersonaForm(personaFormFromRow(selectedPersona));
    setSheetDirty(false);
    setSheetMode(null);
    setPersonaEditorMode("edit");
    setActiveTab("basics");
  }

  function requestPersonaEditorClose() {
    if (hasDirtyEditor()) {
      setShowDirtyGuard(true);
      return;
    }
    closePersonaEditor();
  }

  function openRelationshipCreate() {
    if (!selectedPersona) return;
    const target = personas.find(persona => persona.id !== selectedPersona.id);
    setRelationshipForm({
      targetId  : target?.id ?? "",
      type      : "",
      weight    : "1",
      evidence  : "",
      confidence: "100",
      chapterId : defaultChapterId
    });
    setEditingRelationship(null);
    setSheetDirty(false);
    setSheetMode("relationship-create");
  }

  function openRelationshipEdit(relationship: RoleRelationshipItem) {
    setRelationshipForm({
      targetId  : relationship.targetPersonaId,
      type      : relationship.type,
      weight    : String(relationship.weight),
      evidence  : relationship.evidence ?? "",
      confidence: String(Math.round((relationship.confidence ?? 1) * 100)),
      chapterId : relationship.chapterId
    });
    setEditingRelationship(relationship);
    setSheetDirty(false);
    setSheetMode("relationship-edit");
  }

  function openBiographyCreate() {
    setBiographyForm({ ...emptyBiographyForm, chapterId: defaultChapterId });
    setEditingBiography(null);
    setSheetDirty(false);
    setSheetMode("biography-create");
  }

  function openBiographyEdit(biography: RoleBiographyItem) {
    setBiographyForm({
      chapterId: biography.chapterId,
      category : biography.category,
      title    : biography.title ?? "",
      location : biography.location ?? "",
      event    : biography.event
    });
    setEditingBiography(biography);
    setSheetDirty(false);
    setSheetMode("biography-edit");
  }

  function openAliasCreate() {
    setAliasForm({
      ...emptyAliasForm,
      resolvedName: selectedPersona?.name ?? ""
    });
    setSheetDirty(false);
    setSheetMode("alias-create");
  }

  function validateSheetForm(): string | null {
    if (sheetMode === "relationship-create" || sheetMode === "relationship-edit") {
      if (!relationshipForm.targetId) return "请选择对方角色后再保存关系。";
      if (!relationshipForm.chapterId) return "请选择章节后再保存关系。";
      if (!relationshipForm.type.trim()) return "请填写关系类型后再保存关系。";
    }

    if (sheetMode === "biography-create" || sheetMode === "biography-edit") {
      if (!biographyForm.chapterId) return "请选择章节后再保存传记事件。";
      if (!biographyForm.event.trim()) return "请填写事件描述后再保存传记事件。";
    }

    if (sheetMode === "alias-create" && !aliasForm.alias.trim()) {
      return "请填写别名后再保存映射。";
    }

    return null;
  }

  function validatePersonaForm(): string | null {
    if (!personaForm.name.trim()) return "请填写角色姓名后再保存。";
    return null;
  }

  async function savePersonaForm() {
    if (!selectedPersona && personaEditorMode === "edit") return;
    const validationError = validatePersonaForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (personaEditorMode === "create") {
        await createBookPersona(bookId, toPersonaBody(personaForm));
      }
      if (personaEditorMode === "edit" && selectedPersona) {
        const body = toPersonaBody(personaForm);
        await patchPersona(selectedPersona.id, { ...body, bookId, localName: body.localName ?? body.name });
      }
      await loadPersonas();
      closePersonaEditor();
    } catch {
      setError("保存失败，请检查输入后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function saveSheet() {
    if (!selectedPersona && sheetMode !== "persona-create") return;
    const validationError = validateSheetForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (sheetMode === "relationship-create" && selectedPersona) {
        await createRelationship(bookId, {
          chapterId : relationshipForm.chapterId,
          sourceId  : selectedPersona.id,
          targetId  : relationshipForm.targetId,
          type      : relationshipForm.type.trim(),
          weight    : Number(relationshipForm.weight) || 1,
          evidence  : relationshipForm.evidence.trim() || null,
          confidence: Math.min(100, Math.max(0, Number(relationshipForm.confidence) || 0)) / 100
        });
        onRefreshDrafts();
        await loadPersonaDetail(selectedPersona.id);
      }
      if (sheetMode === "relationship-edit" && editingRelationship) {
        await patchRelationship(editingRelationship.id, {
          type      : relationshipForm.type.trim(),
          weight    : Number(relationshipForm.weight) || 1,
          evidence  : relationshipForm.evidence.trim() || null,
          confidence: Math.min(100, Math.max(0, Number(relationshipForm.confidence) || 0)) / 100
        });
        onRefreshDrafts();
        await loadPersonaDetail(selectedPersona.id);
      }
      if (sheetMode === "biography-create" && selectedPersona) {
        await createBiography(selectedPersona.id, {
          chapterId: biographyForm.chapterId,
          category : biographyForm.category,
          title    : biographyForm.title.trim() || null,
          location : biographyForm.location.trim() || null,
          event    : biographyForm.event.trim()
        });
        onRefreshDrafts();
        await loadPersonaDetail(selectedPersona.id);
      }
      if (sheetMode === "biography-edit" && editingBiography) {
        await patchBiography(editingBiography.id, {
          chapterId: biographyForm.chapterId,
          category : biographyForm.category,
          title    : biographyForm.title.trim() || null,
          location : biographyForm.location.trim() || null,
          event    : biographyForm.event.trim()
        });
        onRefreshDrafts();
        await loadPersonaDetail(selectedPersona.id);
      }
      if (sheetMode === "alias-create" && selectedPersona) {
        await createAliasMapping(bookId, {
          alias       : aliasForm.alias.trim(),
          resolvedName: aliasForm.resolvedName.trim() || selectedPersona.name,
          aliasType   : aliasForm.aliasType.trim() || "TITLE",
          personaId   : selectedPersona.id
        });
        onRefreshAliases();
      }
      closeSheet();
    } catch {
      setError("保存失败，请检查输入后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function updateRelationshipStatus(relationshipId: string, status: "VERIFIED" | "REJECTED") {
    setError(null);
    try {
      await patchRelationship(relationshipId, { status });
      onRefreshDrafts();
      if (selectedPersona) await loadPersonaDetail(selectedPersona.id);
    } catch {
      setError("关系确认失败，请稍后重试。");
    }
  }

  async function updateBiographyStatus(biographyId: string, status: "VERIFIED" | "REJECTED") {
    setError(null);
    try {
      await patchBiography(biographyId, { status });
      onRefreshDrafts();
      if (selectedPersona) await loadPersonaDetail(selectedPersona.id);
    } catch {
      setError("传记事件确认失败，请稍后重试。");
    }
  }

  async function updateAliasStatus(mappingId: string, action: "verify" | "reject") {
    setError(null);
    try {
      if (action === "verify") await confirmAliasMapping(bookId, mappingId);
      else                     await rejectAliasMapping(bookId, mappingId);
      onRefreshAliases();
    } catch {
      setError("别名确认失败，请稍后重试。");
    }
  }

  async function openDelete() {
    if (!selectedPersona) return;
    setDeleteTarget(selectedPersona);
    setDeletePreview(null);
    setDeleteLoading(true);
    setError(null);
    try {
      setDeletePreview(await fetchPersonaDeletePreview(selectedPersona.id, bookId));
    } catch {
      setError("删除影响预览加载失败，请稍后重试。");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deletePersona(deleteTarget.id, bookId);
      setDeleteTarget(null);
      setDeletePreview(null);
      setPersonaDetail(null);
      await loadPersonas();
    } catch {
      setError("删除角色失败，请稍后重试。");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="role-review-workbench grid h-full min-h-0 grid-rows-[minmax(0,240px)_minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-[minmax(260px,320px)_1fr] lg:grid-rows-1">
      {!sidebarCollapsed && (
        <RoleReviewSidebar
          query={query}
          roleFilter={roleFilter}
          sortMode={sortMode}
          loading={loading}
          visibleRoles={visibleRoles}
          selectedPersonaId={selectedPersona?.id ?? null}
          pendingCounts={pendingCounts}
          onQueryChange={setQuery}
          onFilterChange={setRoleFilter}
          onSortModeChange={setSortMode}
          onCollapse={() => setSidebarCollapsed(true)}
          onSelectRole={selectRole}
        />
      )}

      <main className="role-review-workspace flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background">
        {sidebarCollapsed && (
          <Button type="button" size="sm" variant="ghost" className="m-3" onClick={() => setSidebarCollapsed(false)}>
            <ChevronRight className="size-4" />
            展开角色列表
          </Button>
        )}
        {error && (
          <div className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {!selectedPersona && !loading && (
          <div className="p-8 text-center text-sm text-muted-foreground">请选择一个角色开始补全/校对。</div>
        )}
        {selectedPersona && (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{selectedPersona.name}</h3>
                    {selectedPersona.localName !== selectedPersona.name && <Badge variant="outline">{selectedPersona.localName}</Badge>}
                    <Badge variant="outline">{sourceLabel(selectedPersona.recordSource)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    别名：{selectedPersona.aliases.length > 0 ? selectedPersona.aliases.join("、") : "无"} · 置信度 {Math.round(selectedPersona.confidence * 100)}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={openPersonaCreate}>
                    <Plus className="size-4" />
                    新增角色
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={openPersonaEdit}>
                    <Edit3 className="size-4" />
                    编辑基础资料
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => { void openDelete(); }}>
                    <Trash2 className="size-4" />
                    删除角色
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1 rounded-md bg-muted p-1">
                {WORKSPACE_TABS.map(tab => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
                    className={`rounded px-3 py-1.5 text-sm ${activeTab === tab.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {activeTab === "basics" && (
                <div className="grid gap-4">
                  {personaEditorMode && (
                    <section className="role-persona-inline-editor rounded-md border border-border bg-card p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-foreground">
                            {personaEditorMode === "create" ? "新增角色" : "编辑角色信息"}
                          </h4>
                          <p className="text-sm text-muted-foreground">在当前工作区内完成角色主档与书内档案编辑。</p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" onClick={requestPersonaEditorClose}>
                            取消
                          </Button>
                          <Button type="button" onClick={() => { void savePersonaForm(); }} disabled={saving}>
                            {saving && <Loader2 className="size-4 animate-spin" />}
                            保存
                          </Button>
                        </div>
                      </div>
                      <PersonaFields
                        form={personaForm}
                        chapters={chapterOptions}
                        onChange={(form) => { setPersonaForm(form); markDirty(); }}
                      />
                    </section>
                  )}
                  <RoleBasicsSection persona={selectedPersona} />
                </div>
              )}
              {activeTab === "relationships" && (
                <RoleRelationshipsSection
                  persona={selectedPersona}
                  relationships={selectedRelationships}
                  onCreate={openRelationshipCreate}
                  onEdit={openRelationshipEdit}
                  onVerify={(id) => { void updateRelationshipStatus(id, "VERIFIED"); }}
                  onReject={(id) => { void updateRelationshipStatus(id, "REJECTED"); }}
                />
              )}
              {activeTab === "biographies" && (
                <RoleBiographiesSection
                  biographies={selectedBiographies}
                  onCreate={openBiographyCreate}
                  onEdit={openBiographyEdit}
                  onVerify={(id) => { void updateBiographyStatus(id, "VERIFIED"); }}
                  onReject={(id) => { void updateBiographyStatus(id, "REJECTED"); }}
                  onDelete={(id) => {
                    void deleteBiography(id)
                      .then(async () => {
                        onRefreshDrafts();
                        if (selectedPersona) await loadPersonaDetail(selectedPersona.id);
                      })
                      .catch(() => {
                        setError("删除传记事件失败，请稍后重试。");
                      });
                  }}
                />
              )}
              {activeTab === "aliases" && (
                <RoleAliasesSection
                  aliases={selectedAliases}
                  onCreate={openAliasCreate}
                  onVerify={(id) => { void updateAliasStatus(id, "verify"); }}
                  onReject={(id) => { void updateAliasStatus(id, "reject"); }}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <Sheet modal={false} open={sheetMode !== null} onOpenChange={requestSheetClose}>
        <SheetContent showOverlay={false} className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{getSheetTitle(sheetMode)}</SheetTitle>
            <SheetDescription>{getSheetDescription(sheetMode)}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-4">
            {(sheetMode === "relationship-create" || sheetMode === "relationship-edit") && (
              <RelationshipFields
                form={relationshipForm}
                personas={personas}
                chapters={chapterOptions}
                currentPersonaId={selectedPersona?.id ?? ""}
                isEditing={sheetMode === "relationship-edit"}
                onChange={(form) => { setRelationshipForm(form); markDirty(); }}
              />
            )}
            {(sheetMode === "biography-create" || sheetMode === "biography-edit") && (
              <BiographyFields
                form={biographyForm}
                chapters={chapterOptions}
                onChange={(form) => { setBiographyForm(form); markDirty(); }}
              />
            )}
            {sheetMode === "alias-create" && (
              <AliasFields form={aliasForm} onChange={(form) => { setAliasForm(form); markDirty(); }} />
            )}
          </div>
          <SheetFooter>
            <Button type="button" onClick={() => { void saveSheet(); }} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDirtyGuard} onOpenChange={setShowDirtyGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存修改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前编辑表单中有未保存输入。继续操作会丢弃这些修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingRoleSwitch(null); }}>
              继续编辑
            </AlertDialogCancel>
            <AlertDialogAction onClick={discardDirtyChanges}>放弃修改</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null);
          setDeletePreview(null);
        }
      }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除角色</AlertDialogTitle>
            <AlertDialogDescription>
              删除前请核对级联影响。确认后，该角色及当前书籍内关联数据会被软删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteLoading && !deletePreview && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {deletePreview && (
            <div className="max-h-[520px] overflow-y-auto text-sm">
              <div className="grid gap-2 sm:grid-cols-4">
                <ImpactCount label="事迹" value={deletePreview.counts.biographyCount} />
                <ImpactCount label="关系" value={deletePreview.counts.relationshipCount} />
                <ImpactCount label="提及" value={deletePreview.counts.mentionCount} />
                <ImpactCount label="档案" value={deletePreview.counts.profileCount} />
              </div>
              <ImpactDetails title="受影响事迹" rows={deletePreview.biographies.map(item => `${item.title ? `${item.title} - ` : ""}${item.event}`)} />
              <ImpactDetails title="受影响关系" rows={deletePreview.relationships.map(item => `${item.sourceName} -> ${item.targetName}（${item.type}）`)} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading || !deletePreview}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteLoading ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
