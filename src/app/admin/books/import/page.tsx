"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/import/page.tsx`
 * ----------------------------------------------------------------------------
 * 这是管理端“书籍导入向导页”，路由为 `/admin/books/import`。
 *
 * Next.js 角色与框架语义：
 * 1) 文件名是 `page.tsx`：在 App Router 下会被 Next.js 识别为一个可访问页面。
 * 2) 顶部声明 `"use client"`：该页面是 Client Component。
 *    - 原因：页面包含文件上传、拖拽、表单输入、本地状态机、多步交互、toast 提示，这些都依赖浏览器事件。
 *    - 影响：该页面代码会打包到浏览器侧执行；交互即时，但需要注意客户端状态一致性。
 *
 * 所属层次：
 * - 前端渲染层（页面 + 交互容器）；
 * - 通过 `src/lib/services/books.ts` 与 `src/lib/services/model-strategy.ts` 调用接口，
 *   间接驱动后端创建书籍、确认章节、保存书籍策略、启动解析。
 *
 * 核心业务目标：
 * - 以“4 步向导”降低一次性操作复杂度：上传信息 -> 确认章节 -> 配置解析 -> 查看进度。
 * - 在同一页面串联导入闭环，避免管理员在多个页面来回切换导致上下文丢失。
 *
 * 上下游关系：
 * - 上游输入：管理员本地 txt 文件、书籍元数据、章节范围/勾选、模型策略。
 * - 下游调用：
 *   - `createBook`：创建书籍 + 上传源文件
 *   - `fetchChapterPreview`：AI 章节切分预览
 *   - `confirmBookChapters`：确认章节结构
 *   - `saveBookStrategy`：保存书籍级阶段模型策略
 *   - `startAnalysis`：启动解析任务
 * - 下游展示：第 4 步复用 `BookDetailTabs`，直接承接详情页的实时面板。
 *
 * 重要维护约束（业务规则，不是技术限制）：
 * - 向导步骤顺序是业务流程契约：不能跳过章节确认直接启动解析。
 * - 文件大小上限 50MB 和仅支持 txt 是当前产品运营规则，修改需同步后端/产品策略。
 * - `scope` 不同分支对应后端解析协议，不可随意调整字段名或分支条件。
 * ============================================================================
 */

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
import { useAdminModels } from "@/hooks/use-admin-models";
import { ModelStrategyForm, type EnabledModelItem } from "@/app/admin/_components/model-strategy-form";
import {
  saveBookStrategy,
  type ModelStrategyInput
} from "@/lib/services/model-strategy";
import { fetchActiveBookTypes, type BookTypeOption } from "@/lib/services/book-types";
import { cn } from "@/lib/utils";

/**
 * 向导步骤枚举。
 * - 1：上传与基础信息
 * - 2：章节预览确认
 * - 3：解析范围与模型策略配置
 * - 4：任务已启动后的实时进度
 */
type ImportStep = 1 | 2 | 3 | 4;

/**
 * 上传文件大小上限（50MB）。
 * 这是当前业务规则，用于在前端提前失败，减少无效上传占用网络与后端资源。
 */
const MAX_BOOK_FILE_SIZE = 50 * 1024 * 1024;

/**
 * 将下拉框字符串转换为后端约定的解析范围枚举。
 *
 * 为什么要显式转换：
 * - DOM 事件只能得到 string，直接透传容易传入无效值；
 * - 统一在此做白名单兜底，异常值回退 `FULL_BOOK`，保证请求体可用。
 */
function parseScope(value: string): AnalyzeScope {
  if (value === "CHAPTER_RANGE") return "CHAPTER_RANGE";
  if (value === "CHAPTER_LIST") return "CHAPTER_LIST";
  return "FULL_BOOK";
}

/**
 * 将输入框内容解析为正整数，非法时返回 null。
 *
 * 业务语义：
 * - 章节序号只能是正整数；
 * - 空字符串返回 null，交给上层分支做统一错误提示，避免 Number("")=0 的隐式陷阱。
 */
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

/**
 * 校验章节类型是否在后端支持范围内。
 *
 * 说明：预览数据来自后端，理论上应可信；这里再做一次防御性收口，
 * 防止历史脏数据或枚举扩展未同步时把非法类型提交到确认接口。
 */
function parseChapterType(value: string): ChapterType | null {
  if (value === "PRELUDE" || value === "CHAPTER" || value === "POSTLUDE") {
    return value;
  }

  return null;
}

/**
 * 管理端导入页面组件（容器型页面组件）。
 *
 * 职责：
 * - 维护导入向导状态机；
 * - 收集上传与配置参数；
 * - 调用 books service 推进后端流程；
 * - 根据步骤渲染对应 UI 分区。
 */
export default function AdminImportPage() {
  /** 当前步骤，默认从第 1 步开始。 */
  const [step, setStep] = useState<ImportStep>(1);

  /** 选中的本地文件（上传主输入）。null 表示尚未选择。 */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  /** 文件校验错误文案；用于在表单区域内就地反馈。 */
  const [fileError, setFileError] = useState<string | null>(null);

  // Step 1：基础元数据（可选，允许后端自动识别）
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");

  // 动态加载书籍类型列表（替代硬编码的书籍类型下拉）
  const [bookTypes, setBookTypes] = useState<BookTypeOption[]>([]);
  useEffect(() => {
    fetchActiveBookTypes().then(setBookTypes).catch(() => {/* 静默降级 */});
  }, []);

  // Step 2：章节预览与确认所需状态
  /** 创建成功后的书籍主标识。后续所有步骤都依赖该 ID。 */
  const [createdBook, setCreatedBook] = useState<CreatedBookData | null>(null);
  /** 章节预览列表，来自章节切分预览接口。 */
  const [previewItems, setPreviewItems] = useState<ChapterPreviewItem[]>([]);
  /** 章节预览加载中标记。 */
  const [previewLoading, setPreviewLoading] = useState(false);
  /** 章节预览加载失败文案。 */
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Step 3：解析配置状态
  /** 解析范围，默认全书解析，保证最少配置即可启动。 */
  const [scope, setScope] = useState<AnalyzeScope>("FULL_BOOK");
  /** 范围模式下的起止章节（字符串形式以便与输入框受控绑定）。 */
  const [chapterStart, setChapterStart] = useState("");
  const [chapterEnd, setChapterEnd] = useState("");
  /** 多选模式下勾选的章节序号集合。Set 便于 O(1) 增删查。 */
  const [selectedChapterIndices, setSelectedChapterIndices] = useState<Set<number>>(new Set());

  /** 本次任务覆盖策略（可选）。
   * - null：不覆盖，走书籍/全局默认策略。
   * - 有值：按阶段覆盖本次任务模型。
   */
  const [jobStrategy, setJobStrategy] = useState<ModelStrategyInput | null>(null);

  // 统一 Store：模块级缓存，不重复拉取
  const { models, loading: modelsLoading, error: modelsLoadError } = useAdminModels({ onlyEnabled: true });

  // Shared UI state
  /**
   * 通用提交通道锁。
   * 设计目的：防止用户在请求未完成时重复点击，导致重复创建或重复启动任务。
   */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 当进入第 2 步且已创建书籍后，自动请求章节预览。
   *
   * 为什么放在 effect：
   * - 第 2 步是“章节确认”页面的数据进入点；
   * - `step` 和 `createdBook` 是该请求的最小依赖，避免额外请求。
   */
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

  /**
   * 校验上传文件是否合法。
   *
   * 业务规则：
   * - 必须上传 txt（当前解析链路按纯文本处理）；
   * - 大小 <= 50MB（控制上传与解析资源成本）。
   */
  function validateImportFile(file: File | null): string | null {
    if (!file) return "请先选择 .txt 文件";
    if (!/\.txt$/i.test(file.name)) return "仅支持 .txt 文件";
    if (file.size > MAX_BOOK_FILE_SIZE) return "文件大小不能超过 50MB";
    return null;
  }

  /**
   * 统一处理“手动选文件 / 拖拽文件”两种入口，避免校验逻辑分叉。
   */
  function selectImportFile(file: File | null) {
    setSelectedFile(file);
    setFileError(validateImportFile(file));
  }

  /**
   * 拖拽上传处理。
   * `preventDefault` 必须保留，否则浏览器会尝试直接打开文件。
   */
  function handleDropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    selectImportFile(event.dataTransfer.files?.[0] ?? null);
  }

  /**
   * 第 1 步提交：创建书籍并上传源文件。
   *
   * 业务步骤：
   * 1) 先做前端文件校验，失败即阻断；
   * 2) 组装 FormData（仅传有值字段，减少无意义空串污染）；
   * 3) 调用创建接口；
   * 4) 成功后记录 `createdBook` 并进入第 2 步。
   */
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
      // 这里是防御性兜底：理论上前面已校验，这里再收口避免空值穿透。
      if (!selectedFile) {
        throw new Error("请选择导入文件");
      }

      const formData = new FormData();
      formData.set("file", selectedFile);
      if (title) formData.set("title", title);
      if (author) formData.set("author", author);
      if (dynasty) formData.set("dynasty", dynasty);
      if (genre) formData.set("genre", genre);
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

  /**
   * FG-09: 更新指定章节的标题。
   */
  function updatePreviewTitle(idx: number, value: string) {
    setPreviewItems(prev => prev.map((item, i) => i === idx ? { ...item, title: value } : item));
  }

  /**
   * FG-09: 更新指定章节的章节类型。
   */
  function updatePreviewChapterType(idx: number, value: string) {
    setPreviewItems(prev => prev.map((item, i) => i === idx ? { ...item, chapterType: value } : item));
  }

  /**
   * FG-09: 将 idx 位置的章节合并到上一个章节。
   * 合并策略：保留上一章的 index 与 title，字数求和，移除当前章节行。
   */
  function mergeWithPrevious(idx: number) {
    if (idx === 0) return;
    setPreviewItems(prev => {
      const next = [...prev];
      const merged = { ...next[idx - 1], wordCount: next[idx - 1].wordCount + next[idx].wordCount };
      next[idx - 1] = merged;
      next.splice(idx, 1);
      return next;
    });
  }

  /**
   * 第 2 步提交：确认章节结构。
   *
   * 业务意义：
   * - 让管理员在 AI 自动切分后进行人工确认；
   * - 避免错误切分直接进入解析，导致后续人物/关系提取质量下降。
   */
  async function handleConfirmChapters() {
    if (!createdBook || previewItems.length === 0) return;

    setIsSubmitting(true);
    try {
      const confirmItems = previewItems.map(item => {
        const chapterType = parseChapterType(item.chapterType);
        if (!chapterType) {
          // 这是数据契约防线：当后端返回未知章节类型时，阻止写入并提示。
          throw new Error(`不支持的章节类型: ${item.chapterType}`);
        }
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

  /**
   * 第 3 步提交：启动解析任务。
   *
   * 分支说明：
   * - `FULL_BOOK`：无额外参数，适合默认全量解析；
   * - `CHAPTER_RANGE`：需要合法起止章节；
   * - `CHAPTER_LIST`：至少勾选一个章节。
   *
   * 这些是业务规则，不是技术限制：
   * - 列表为空或范围非法时直接阻断提交，防止产生无效任务记录。
   */
  async function handleStartAnalysis() {
    if (!createdBook) return;

    setIsSubmitting(true);
    try {
      let body: StartAnalysisBody;

      // 仅当存在有效配置时才传 modelStrategy，避免向后端发送空对象产生语义歧义。
      const requestModelStrategy = jobStrategy && Object.keys(jobStrategy).length > 0
        ? { stages: jobStrategy }
        : undefined;

      // 导入流程配置的阶段模型应成为书籍级默认策略，避免“任务已生效但书籍面板仍显示继承默认”。
      if (requestModelStrategy) {
        await saveBookStrategy(createdBook.id, requestModelStrategy.stages);
      }

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
          // 排序是为了让请求体稳定，便于后端日志排查与重放。
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
      if (requestModelStrategy) {
        toast.success("解析任务已启动，书籍模型策略已同步");
      } else {
        toast.success("解析任务已启动！");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "启动失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 向导步骤文案（与 ImportStep 一一对应）。 */
  const stepLabels = ["上传信息", "确认章节", "解析配置", "实时进度"];

  /**
   * `ModelStrategyForm` 所需模型结构。
   * 这里显式映射是为了隔离后端字段变化，形成页面自己的输入契约。
   */
  const enabledModels: EnabledModelItem[] = models.map((model) => ({
    id             : model.id,
    name           : model.name,
    provider       : model.provider,
    providerModelId: model.providerModelId,
    aliasKey       : model.aliasKey
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/*
        页面头部：
        - 告知当前位置与操作目标；
        - 提供返回书库列表的兜底出口，防止用户被困在向导中。
      */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">导入书籍</h1>
          <p className="text-muted-foreground mt-1">按照向导完成书籍导入与解析配置</p>
        </div>
        <Link href="/admin/books" className="interactive-text-link text-sm font-medium text-primary hover:underline">
          返回书库列表
        </Link>
      </div>

      {/*
        步骤指示器：
        - 通过 `step >= s` 高亮已完成/当前步骤，形成明确进度反馈；
        - 下方进度条宽度按 4 步线性计算。
      */}
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

      {/* 步骤内容区：根据当前 step 条件渲染，确保单步聚焦。 */}
      <div className="space-y-6">

        {/* 第 1 步：上传文件与补充元数据 */}
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
                  <label htmlFor="genre" className="text-sm font-medium">书籍类型</label>
                  <select
                    id="genre"
                    className="w-full h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                    value={genre}
                    onChange={e => setGenre(e.target.value)}
                  >
                    <option value="">自动（可选）</option>
                    {bookTypes.map(bt => (
                      <option key={bt.id} value={bt.key}>{bt.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">简介</label>
                  <Input id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="可选" />
                </div>

                <div className="md:col-span-2 flex justify-end">
                  {/*
                    禁用条件：
                    - 提交中：防重复；
                    - 未选择文件：阻断无效提交。
                  */}
                  <Button type="submit" disabled={isSubmitting || !selectedFile}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    下一步：生成章节预览
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 第 2 步：章节预览确认（导入质量控制关键步骤） */}
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
                    // 手动重试：清理错误并重新拉取预览。
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
                          <th className="px-4 py-2 text-left w-24">类型</th>
                          <th className="px-4 py-2 text-left">标题</th>
                          <th className="px-4 py-2 text-right w-20">字数</th>
                          <th className="px-4 py-2 w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-4 py-2 text-muted-foreground">{item.index}</td>
                            <td className="px-4 py-2">
                              {/* FG-09: 章节类型可修改 */}
                              <select
                                className="w-full rounded border border-border bg-transparent px-1 py-0.5 text-xs"
                                value={item.chapterType}
                                onChange={e => updatePreviewChapterType(idx, e.target.value)}
                              >
                                <option value="PRELUDE">序章</option>
                                <option value="CHAPTER">正文</option>
                                <option value="POSTLUDE">尾声</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              {/* FG-09: 标题内联编辑 */}
                              <Input
                                className="h-7 text-sm font-medium px-2 py-0"
                                value={item.title}
                                onChange={e => updatePreviewTitle(idx, e.target.value)}
                              />
                            </td>
                            <td className="px-4 py-2 text-right opacity-70">{item.wordCount}</td>
                            <td className="px-4 py-2 text-right">
                              {/* FG-09: 合并到上一章 */}
                              {idx > 0 && (
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  title="合并到上一章"
                                  onClick={() => mergeWithPrevious(idx)}
                                >
                                  合并↑
                                </button>
                              )}
                            </td>
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

        {/* 第 3 步：模型策略 + 解析范围配置 */}
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
                  // 仅保存到本页状态，真正提交发生在“启动解析任务”时。
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
                {/* 范围选择：决定请求体走哪个判别联合分支 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">解析范围</label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-transparent px-3 text-sm"
                      value={scope}
                      onChange={(event) => {
                        setScope(parseScope(event.target.value));
                        // 切换范围时重置离散章节选择，避免旧状态污染新配置。
                        setSelectedChapterIndices(new Set());
                      }}
                    >
                      <option value="FULL_BOOK">全书解析</option>
                      <option value="CHAPTER_LIST">多选指定章节</option>
                      <option value="CHAPTER_RANGE">指定范围</option>
                    </select>
                  </div>

                  {/* 范围模式：输入起止章节 */}
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

                  {/* 离散章节模式：复用第 2 步预览结果进行勾选 */}
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

        {/*
          第 4 步：实时进度展示。
          这里直接复用详情页的 Tab 组件，保证“导入后看到的进度”与“详情页进度”一致，
          避免两套实现导致状态解释不一致。
        */}
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
