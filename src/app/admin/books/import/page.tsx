"use client";

import { type DragEvent, type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  UploadCloud,
  XCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  confirmBookChapters,
  createBook,
  fetchChapterPreview,
  startAnalysis,
  type AnalyzeScope,
  type ChapterPreviewItem,
  type ChapterType,
  type CreatedBookData,
  type StartAnalysisBody
} from "@/lib/services/books";
import { BookDetailTabs } from "@/app/admin/books/[id]/_components/book-detail-tabs";
import { fetchModels, type AdminModelItem } from "@/lib/services/models";
import { ModelStrategyForm, type EnabledModelItem } from "@/app/admin/_components/model-strategy-form";
import type { ModelStrategyInput } from "@/lib/services/model-strategy";
import { cn } from "@/lib/utils";

type ImportStep = 1 | 2 | 3 | 4;
const MAX_BOOK_FILE_SIZE = 50 * 1024 * 1024;

function parseScope(value: string): AnalyzeScope {
  if (value === "CHAPTER_RANGE") return "CHAPTER_RANGE";
  if (value === "CHAPTER_LIST") return "CHAPTER_LIST";
  return "FULL_BOOK";
}

function parsePositiveInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function parseChapterType(value: string): ChapterType | null {
  if (value === "PRELUDE" || value === "CHAPTER" || value === "POSTLUDE") {
    return value;
  }

  return null;
}

export default function AdminImportPage() {
  const [step, setStep] = useState<ImportStep>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Step 1 form state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 state
  const [createdBook, setCreatedBook] = useState<CreatedBookData | null>(null);
  const [previewItems, setPreviewItems] = useState<ChapterPreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Step 3 config state
  const [scope, setScope] = useState<AnalyzeScope>("FULL_BOOK");
  const [chapterStart, setChapterStart] = useState("");
  const [chapterEnd, setChapterEnd] = useState("");
  const [selectedChapterIndices, setSelectedChapterIndices] = useState<Set<number>>(new Set());
  const [jobStrategy, setJobStrategy] = useState<ModelStrategyInput | null>(null);
  const [models, setModels] = useState<AdminModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsLoadError, setModelsLoadError] = useState<string | null>(null);



  // Shared UI state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load models once on mount
  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      setModelsLoading(true);
      setModelsLoadError(null);
      try {
        const allModels = await fetchModels();
        const enabledModels = allModels.filter(m => m.isEnabled);
        if (cancelled) return;
        setModels(enabledModels);
        if (enabledModels.length === 0) setModelsLoadError("暂无可用模型，请先到模型设置页面启用模型。");
      } catch (err) {
        if (!cancelled) {
          setModels([]);
          setModelsLoadError(err instanceof Error ? err.message : "模型列表加载失败");
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }
    void loadModels();
    return () => { cancelled = true; };
  }, []);

  // Auto-load chapter preview when entering step 2
  useEffect(() => {
    if (step !== 2 || !createdBook) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    fetchChapterPreview(createdBook.id)
      .then(items => { if (!cancelled) setPreviewItems(items); })
      .catch(err => { if (!cancelled) setPreviewError(err instanceof Error ? err.message : "章节预览加载失败"); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [step, createdBook]);



  // Handlers
  function validateImportFile(file: File | null): string | null {
    if (!file) return "请先选择 .txt 文件";
    if (!/\.txt$/i.test(file.name)) return "仅支持 .txt 文件";
    if (file.size > MAX_BOOK_FILE_SIZE) return "文件大小不能超过 50MB";
    return null;
  }

  function selectImportFile(file: File | null) {
    setSelectedFile(file);
    setFileError(validateImportFile(file));
  }

  function handleDropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    selectImportFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleCreateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentFileError = validateImportFile(selectedFile);
    if (currentFileError) {
      setFileError(currentFileError);
      toast.error(currentFileError);
      return;
    }
    setIsSubmitting(true);
    try {
      if (!selectedFile) {
        throw new Error("请选择导入文件");
      }
      const formData = new FormData();
      formData.set("file", selectedFile);
      if (title) formData.set("title", title);
      if (author) formData.set("author", author);
      if (dynasty) formData.set("dynasty", dynasty);
      if (description) formData.set("description", description);
      const data = await createBook(formData);
      setCreatedBook({ id: data.id, title: data.title });
      setStep(2);
      toast.success("书籍已创建，正在加载章节预览...");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建书籍失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmChapters() {
    if (!createdBook || previewItems.length === 0) return;
    setIsSubmitting(true);
    try {
      const confirmItems = previewItems.map(item => {
        const chapterType = parseChapterType(item.chapterType);
        if (!chapterType) throw new Error(`不支持的章节类型: ${item.chapterType}`);
        return { index: item.index, chapterType, title: item.title };
      });
      await confirmBookChapters(createdBook.id, confirmItems);
      setStep(3);
      toast.success("章节已确认，请配置解析参数");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "章节确认失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartAnalysis() {
    if (!createdBook) return;
    setIsSubmitting(true);
    try {
      let body: StartAnalysisBody;
      const requestModelStrategy = jobStrategy && Object.keys(jobStrategy).length > 0
        ? { stages: jobStrategy }
        : undefined;
      if (scope === "CHAPTER_RANGE") {
        const parsedStart = parsePositiveInteger(chapterStart);
        const parsedEnd = parsePositiveInteger(chapterEnd);
        if (parsedStart === null || parsedEnd === null) {
          toast.error("请输入合法的章节范围（正整数）");
          setIsSubmitting(false);
          return;
        }
        body = {
          scope        : "CHAPTER_RANGE",
          chapterStart : parsedStart,
          chapterEnd   : parsedEnd,
          modelStrategy: requestModelStrategy
        };
      } else if (scope === "CHAPTER_LIST") {
        if (selectedChapterIndices.size === 0) {
          toast.error("请至少勾选一个章节");
          setIsSubmitting(false);
          return;
        }
        body = {
          scope         : "CHAPTER_LIST",
          chapterIndices: [...selectedChapterIndices].sort((a, b) => a - b),
          modelStrategy : requestModelStrategy
        };
      } else {
        body = {
          scope        : "FULL_BOOK",
          modelStrategy: requestModelStrategy
        };
      }
      await startAnalysis(createdBook.id, body);
      setStep(4);
      toast.success("解析任务已启动！");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "启动失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepLabels = ["上传信息", "确认章节", "解析配置", "实时进度"];
  const enabledModels: EnabledModelItem[] = models.map((model) => ({
    id             : model.id,
    name           : model.name,
    provider       : model.provider,
    providerModelId: model.providerModelId,
    aliasKey       : model.aliasKey
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">导入书籍</h1>
          <p className="text-muted-foreground mt-1">按照向导完成书籍导入与解析配置</p>
        </div>
        <Link href="/admin/books" className="text-sm font-medium text-primary hover:underline">
          返回书库列表
        </Link>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center justify-between relative px-4">
        {([1, 2, 3, 4] as const).map((s) => (
          <div key={s} className="flex flex-col items-center z-10 relative">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 border-2",
              step >= s
                ? "bg-primary text-white border-primary"
                : "bg-background text-muted-foreground border-border"
            )}>
              {step > s ? <CheckCircle2 size={16} /> : s}
            </div>
            <span className="text-xs mt-2 font-medium text-muted-foreground">{stepLabels[s - 1]}</span>
          </div>
        ))}
        <div className="absolute left-0 right-0 top-4 h-0.5 bg-border z-0 mx-8" />
        <div
          className="absolute left-0 top-4 h-0.5 bg-primary z-0 mx-8 transition-all duration-300"
          style={{ width: `${((Math.min(step, 4) - 1) / 3) * 100}%` }}
        />
      </div>

      {/* Step Content */}
      <div className="space-y-6">

        {/* Step 1: Upload & Metadata */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>书籍信息与上传</CardTitle>
              <CardDescription>支持 .txt 格式，建议 UTF-8 编码</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => { void handleCreateBook(event); }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium">文件上传 *</label>
                  <div
                    className={cn(
                      "border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-primary transition-colors cursor-pointer bg-background/50",
                      fileError ? "border-destructive" : undefined
                    )}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropFile}
                  >
                    <input
                      type="file"
                      accept=".txt"
                      onChange={(event) => selectImportFile(event.target.files?.[0] ?? null)}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <UploadCloud className="w-10 h-10 text-muted-foreground mb-2" />
                      <span className="text-sm font-medium text-foreground">
                        {selectedFile ? selectedFile.name : "点击选择或拖拽文件"}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">最大 50MB</span>
                    </label>
                  </div>
                  {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="title" className="text-sm font-medium">书名</label>
                  <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="自动识别，可修改" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="author" className="text-sm font-medium">作者</label>
                  <Input id="author" value={author} onChange={e => setAuthor(e.target.value)} placeholder="例如：曹雪芹" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="dynasty" className="text-sm font-medium">朝代</label>
                  <Input id="dynasty" value={dynasty} onChange={e => setDynasty(e.target.value)} placeholder="例如：清代" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">简介</label>
                  <Input id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="可选" />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={isSubmitting || !selectedFile}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    下一步：生成章节预览
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Chapter Preview & Confirm */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>章节预览确认</CardTitle>
              <CardDescription>
                《{createdBook?.title}》— 请确认 AI 识别的章节是否正确
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previewLoading ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span>正在识别章节结构...</span>
                </div>
              ) : previewError ? (
                <div className="flex flex-col items-center py-12 gap-4">
                  <XCircle className="w-8 h-8 text-destructive" />
                  <p className="text-sm text-destructive">{previewError}</p>
                  <Button variant="outline" onClick={() => {
                    setPreviewError(null);
                    setPreviewLoading(true);
                    if (createdBook) {
                      fetchChapterPreview(createdBook.id)
                        .then(items => setPreviewItems(items))
                        .catch(err => setPreviewError(err instanceof Error ? err.message : "加载失败"))
                        .finally(() => setPreviewLoading(false));
                    }
                  }}>
                    重试
                  </Button>
                </div>
              ) : (
                <>
                  <div className="max-h-100 overflow-y-auto border rounded-md mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/10 sticky top-0 backdrop-blur">
                        <tr>
                          <th className="px-4 py-2 text-left w-12">序</th>
                          <th className="px-4 py-2 text-left">标题</th>
                          <th className="px-4 py-2 text-right">字数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-4 py-2 text-muted-foreground">{item.index}</td>
                            <td className="px-4 py-2 font-medium">{item.title}</td>
                            <td className="px-4 py-2 text-right opacity-70">{item.wordCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">共识别到 {previewItems.length} 个章节</span>
                    <Button
                      onClick={() => { void handleConfirmChapters(); }}
                      disabled={isSubmitting || previewItems.length === 0}
                    >
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      确认章节，下一步
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: AI Model & Scope Config */}
        {step === 3 && (
          <div className="space-y-6">
            {modelsLoading ? (
              <Card>
                <CardContent className="pt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载模型列表...
                </CardContent>
              </Card>
            ) : (
              <ModelStrategyForm
                initialStrategy={jobStrategy}
                availableModels={enabledModels}
                onSave={(strategy) => {
                  setJobStrategy(strategy);
                  toast.success("已保存本次任务的阶段模型策略");
                  return Promise.resolve();
                }}
                showResetToRecommended
              />
            )}

            {modelsLoadError && (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  {modelsLoadError}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>解析配置</CardTitle>
                <CardDescription>配置解析范围，确认后启动解析任务</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Scope Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">解析范围</label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                      value={scope}
                      onChange={(event) => {
                        setScope(parseScope(event.target.value));
                        setSelectedChapterIndices(new Set());
                      }}
                    >
                      <option value="FULL_BOOK">全书解析</option>
                      <option value="CHAPTER_LIST">多选指定章节</option>
                      <option value="CHAPTER_RANGE">指定范围</option>
                    </select>
                  </div>
                  {scope === "CHAPTER_RANGE" && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-sm font-medium mb-1 block">起始回</label>
                        <Input type="number" min={1} value={chapterStart} onChange={e => setChapterStart(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="text-sm font-medium mb-1 block">结束回</label>
                        <Input type="number" min={1} value={chapterEnd} onChange={e => setChapterEnd(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {scope === "CHAPTER_LIST" && (
                    <div className="flex items-end">
                      <div className="max-h-50 overflow-y-auto border rounded-md w-full">
                        <table className="w-full text-sm">
                          <tbody>
                            {previewItems.map((item, idx) => (
                              <tr key={idx} className={cn("border-t border-border first:border-0", selectedChapterIndices.has(item.index) && "bg-primary/5")}>
                                <td className="px-3 py-2 w-8">
                                  <input
                                    type="checkbox"
                                    aria-label={`选择 ${item.title}`}
                                    checked={selectedChapterIndices.has(item.index)}
                                    onChange={(e) => {
                                      setSelectedChapterIndices(prev => {
                                        const next = new Set(prev);
                                        if (e.target.checked) {
                                          next.add(item.index);
                                        } else {
                                          next.delete(item.index);
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">{item.title}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                {scope === "CHAPTER_LIST" && (
                  <p className="text-xs text-muted-foreground">已选 {selectedChapterIndices.size} / {previewItems.length} 个章节</p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end pt-2">
              <Button
                size="lg"
                onClick={() => { void handleStartAnalysis(); }}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "启动中..." : "启动解析任务"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: 解析进度（复用书籍详情 Tab 布局：解析进度 / 解析任务 / 人物） */}
        {step === 4 && createdBook && (
          <div className="space-y-6">
            <BookDetailTabs bookId={createdBook.id} initialStatus="PROCESSING" />
            <div className="flex gap-4 justify-end">
              <Button asChild variant="outline">
                <Link href="/admin/books">返回书库列表</Link>
              </Button>
              <Button asChild>
                <Link href={`/admin/books/${createdBook.id}`}>查看书籍详情</Link>
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
