"use client";

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import type {
  GraphEdge,
  GraphFilter,
  GraphLayoutMode,
  GraphNode,
  GraphSnapshot
} from "@/types/graph";
import { fetchBookGraph, searchPersonaPath, updateGraphLayout, type GraphLayoutNodeInput } from "@/lib/services/graph";
import { fetchPersonaDetail, deletePersona } from "@/lib/services/personas";
import { fetchChapterContent } from "@/lib/services/books";
import {
  ForceGraph,
  GraphToolbar,
  PersonaDetailPanel,
  ChapterTimeline,
  TextReaderPanel,
  GraphContextMenu
} from "@/components/graph";
import { GraphPageHeader } from "@/components/graph/graph-page-header";
import { GraphLegend } from "@/components/graph/graph-legend";
import { getEdgeTypeColorsForTheme } from "@/theme";
import { AsyncErrorBoundary } from "@/components/ui/async-error-boundary";
import { toast } from "sonner";

/* -----------------------------------------------------------------------
   关系类型归一化
   将数据中任意粒度的原始关系类型映射到 5 个语义分组，
   保证图例始终只显示 5 种含义清晰、颜色强区分的条目。
   
   分组顺序与 theme edgeTypeColors[0..4] 一一对应：
     0 → 亲属  1 → 友好  2 → 对立  3 → 从属  4 → 其他（兜底）
----------------------------------------------------------------------- */
const RELATION_GROUP_RULES: Array<{
  label   : string;
  idx     : 0 | 1 | 2 | 3;
  keywords: readonly string[];
}> = [
  {
    label   : "亲属",
    idx     : 0,
    keywords: ["夫妻", "父子", "母子", "兄弟", "姐妹", "姻亲", "亲属", "亲戚", "家族", "父女", "母女", "子女", "婚", "兄", "弟", "姊", "妹"]
  },
  {
    label   : "友好",
    idx     : 1,
    keywords: ["朋友", "知己", "盟友", "旧识", "同窗", "友谊", "友好", "情谊"]
  },
  {
    label   : "对立",
    idx     : 2,
    keywords: ["敌对", "竞争", "对立", "冲突", "仇敌", "宿敌", "敌"]
  },
  {
    label   : "从属",
    idx     : 3,
    keywords: ["师徒", "主仆", "君臣", "雇佣", "资助", "教导", "门客", "属下", "侍"]
  }
];
const CANONICAL_GROUPS: Array<{ label: string; idx: number }> = [
  ...RELATION_GROUP_RULES.map(g => ({ label: g.label, idx: g.idx })),
  { label: "其他", idx: 4 }
];

/**
 * 将原始关系类型字符串映射到分组索引（0~4）。
 * 匹配策略：遍历各组关键词，命中即返回；均未命中则返回 4（其他）。
 */
function normalizeRelationIdx(rawType: string): number {
  for (const rule of RELATION_GROUP_RULES) {
    if (rule.keywords.some(kw => rawType.includes(kw))) {
      return rule.idx;
    }
  }
  return 4;
}

/**
 * =============================================================================
 * 文件定位（图谱页面核心容器）
 * -----------------------------------------------------------------------------
 * 组件类型：Client Component（声明了 `"use client"`）。
 *
 * 在 Next.js 应用中的职责：
 * - 承接服务端 page 注入的 `initialSnapshot`，作为图谱首屏数据；
 * - 在客户端维护图谱交互态（筛选、聚焦、路径高亮、右键菜单、详情侧栏、原文侧栏）；
 * - 连接多个 service 请求（图谱刷新、人物详情、路径查询、章节原文）。
 *
 * 为什么必须在客户端：
 * - 需要浏览器 API（全屏、下载、DOM 事件坐标）；
 * - 需要高频本地状态变更（拖拽、悬停、右键、面板开关）；
 * - 需要 Suspense + `use(promise)` 的交互式按需加载体验。
 *
 * 上下游关系：
 * - 上游：`app/(viewer)/books/[id]/graph/page.tsx`（服务端加载 book + snapshot）。
 * - 下游：`ForceGraph / GraphToolbar / ChapterTimeline / PersonaDetailPanel / TextReaderPanel`。
 *
 * 维护注意：
 * - 网络失败时多数场景“保留当前 UI 不清空”，这是体验稳定性策略，不是技术限制；
 * - `selectedPersona.promise` 与 `textReader.promise` 是和 Suspense 配套的设计，不要轻易改成“先 await 再 setState”。
 * - 本组件只负责“图谱交互编排”，具体渲染细节分散在子组件，避免单文件承担全部职责。
 * =============================================================================
 */

interface SelectedPersonaState {
  /** 当前详情面板对应的人物 ID（用于标识当前正在查看哪位人物）。 */
  id     : string;
  /**
   * 人物详情请求 Promise。
   * 这里存 Promise 而不是存最终数据，是为了让子组件通过 React `use()` + Suspense 接管加载态。
   */
  promise: ReturnType<typeof fetchPersonaDetail>;
}

interface TextReaderState {
  /** 当前阅读章节 ID（来自证据点击后的章节定位）。 */
  chapterId : string;
  /** 可选高亮段落索引；为空表示只打开章节，不滚动到特定段落。 */
  paraIndex?: number;
  /** 原文读取 Promise，交给阅读面板用 `use()` 消费。 */
  promise   : ReturnType<typeof fetchChapterContent>;
}

interface PanelFallbackProps {
  /** 面板降级提示文案（加载中/加载失败等）。 */
  message: string;
  /** 关闭面板回调，统一由父组件清理对应状态。 */
  onClose: () => void;
}

/**
 * 比较两个字符串集合内容是否完全一致（忽略引用，只比较值）。
 * 用于避免 setState 时因为新 Set 引用导致无意义重渲染。
 */
function isSameIdSet(current: Set<string>, next: Set<string>): boolean {
  if (current.size !== next.size) {
    return false;
  }
  for (const value of next) {
    if (!current.has(value)) {
      return false;
    }
  }
  return true;
}

/**
 * 人物侧栏的 Suspense/Error 降级视图。
 * 设计意图：侧栏失败不应该波及主图渲染，因此使用独立降级面板隔离故障。
 */
function PanelFallback({ message, onClose }: PanelFallbackProps) {
  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-96 flex-col border-l border-border bg-card shadow-xl">
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {message}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="border-t border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
      >
        关闭
      </button>
    </aside>
  );
}

/**
 * 阅读侧栏降级视图。
 * 与 `PanelFallback` 结构一致但宽度更大，因为正文阅读需要更宽版面。
 */
function ReaderPanelFallback({ message, onClose }: PanelFallbackProps) {
  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-[480px] flex-col border-l border-border bg-card shadow-xl">
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {message}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="border-t border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
      >
        关闭
      </button>
    </aside>
  );
}

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface GraphViewProps {
  /** 当前图谱所属书籍 ID（来自路由参数）。 */
  bookId         : string;
  /**
   * 首屏图谱快照（服务端预取）。
   * 这是 RSC -> Client Component 的数据注入点，能减少首屏白屏与重复请求。
   */
  initialSnapshot: GraphSnapshot;
  /** 该书总章节数，用于时间轴边界。 */
  totalChapters  : number;
  /** 章节单位文案，默认"回"。 */
  chapterUnit?   : string;
  /** 书籍标题，用于图谱专属头部展示。 */
  bookTitle      : string;
  /** 书籍作者，用于图谱头部副标题。 */
  bookAuthor?    : string;
  /**
   * 书籍已解析的人物总数。
   * 与 snapshot 节点数不同：snapshot 可能按章节切片，这里反映全书总人物规模。
   */
  personaCount?  : number;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function GraphView({
  bookId,
  initialSnapshot,
  totalChapters,
  chapterUnit = "回",
  bookTitle,
  bookAuthor,
  personaCount
}: GraphViewProps) {
  // 来自 next-themes：resolvedTheme 可能是 "light" | "dark" | undefined（首次水合前）
  // 这里不自行兜底，让 ForceGraph 内部基于 CSS 变量稳定渲染。
  const { resolvedTheme } = useTheme();
  const router = useRouter();

  // 图谱数据状态：决定主画布展示内容与章节游标。
  // 默认值使用服务端注入，避免客户端首帧再次拉数。
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(initialSnapshot);
  // 默认显示“全书截止章节”，即总章节数。
  const [currentChapter, setCurrentChapter] = useState(totalChapters);
  // 时间轴切换中的局部 loading；只遮罩画布，不阻塞全页面。
  const [loading, setLoading] = useState(false);

  // 交互状态：选中人物、聚焦节点、右键菜单、悬停边信息。
  const [selectedPersona, setSelectedPersona] = useState<SelectedPersonaState | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: GraphNode; position: { x: number; y: number } } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);

  // 工具栏状态：筛选条件、布局模式、路径高亮（节点 + 边）集合。
  const [filter, setFilter] = useState<GraphFilter>({
    relationTypes : [],
    statuses      : [],
    factionIndices: [],
    searchQuery   : ""
  });
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>("force");
  const [highlightPathIds, setHighlightPathIds] = useState<Set<string>>(new Set());
  const [highlightPathEdgeIds, setHighlightPathEdgeIds] = useState<Set<string>>(new Set());
  const [pathAutoFitVersion, setPathAutoFitVersion] = useState(0);

  // 原文阅读面板状态（由证据点击触发）。
  const [textReader, setTextReader] = useState<TextReaderState | null>(null);

  /**
   * FG-06: 多证据游标状态。
   * 人物详情中的 evidence 列表存储多条证据，支持前后跳转翻阅。
   * evidenceList 是当前人物所有证据的 [ chapterId, paraIndex ] 元组列表；
   * evidenceIndex 是当前正在查看的证据游标。
   */
  const [evidenceList, setEvidenceList] = useState<Array<{ chapterId: string; paraIndex?: number }>>([]);
  const [evidenceIndex, setEvidenceIndex] = useState(0);

  /**
   * FG-04: 布局持久化防抖 timer ref。
   * 拖拽结束后等待 1s 才真正发请求，避免频繁拖拽时请求风暴。
   */
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 从当前快照派生可筛选关系类型，避免每次渲染重复扫描。
  // 这里用 useMemo 是为了稳定 Toolbar 的 options，减少不必要重渲染。
  const availableRelationTypes = useMemo(
    () => [...new Set(snapshot.edges.map(e => e.type))],
    [snapshot.edges]
  );

  /**
   * 关系类型到主题颜色的映射表。
   * 按出现顺序从当前主题的 edgeTypeColors 调色板中依次分配颜色，循环使用。
   * 随 snapshot.edges 或主题变更而重算，保证颜色与图谱内容同步。
   */
  const edgeTypeColorMap = useMemo<ReadonlyMap<string, string>>(() => {
    const palette = getEdgeTypeColorsForTheme(resolvedTheme);
    const types = [...new Set(snapshot.edges.map(e => e.type))];
    // 将每种原始类型归到 5 个分组之一，取对应颜色；不再循环，避免不同类型同色。
    return new Map(types.map(type => [type, palette[normalizeRelationIdx(type)] ?? palette[0]]));
  }, [snapshot.edges, resolvedTheme]);

  /**
   * 图例专用映射：只显示 5 个语义分组（当前快照中实际出现的那些）。
   * 键为语义分组标签，值为对应颜色，与 edgeTypeColorMap 保持一致调色板。
   */
  const legendColorMap = useMemo<ReadonlyMap<string, string>>(() => {
    const palette = getEdgeTypeColorsForTheme(resolvedTheme);
    // 计算快照中实际出现了哪些分组
    const presentIdxs = new Set(snapshot.edges.map(e => normalizeRelationIdx(e.type)));
    return new Map(
      CANONICAL_GROUPS
        .filter(g => presentIdxs.has(g.idx))
        .map(g => [g.label, palette[g.idx] ?? palette[0]])
    );
  }, [snapshot.edges, resolvedTheme]);

  /**
   * 按章节号刷新图谱快照。
   * - 成功：替换 snapshot；
   * - 失败：保留当前 snapshot，避免页面清空造成交互割裂。
   */
  const fetchGraph = useCallback(async (chapter: number) => {
    setLoading(true);
    try {
      const data = await fetchBookGraph(bookId, chapter);
      setSnapshot(data);
    } catch {
      // 网络异常时静默保持旧数据，这是“优先可操作性”的产品策略。
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  /**
   * 时间轴变更处理。
   * 先更新 UI 指示，再触发异步请求，确保用户立即看到“已切到第 N 章”反馈。
   */
  function handleChapterChange(chapter: number) {
    setCurrentChapter(chapter);
    void fetchGraph(chapter);
  }

  /**
   * 打开人物详情面板并创建 Promise。
   * 说明：不在这里 await，是为了让 Suspense 控制加载过渡，避免手动维护多组 loading 状态。
   */
  function openPersonaDetail(personaId: string) {
    setSelectedPersona({
      id     : personaId,
      promise: fetchPersonaDetail(personaId)
    });
  }

  /** 单击节点：打开详情并关闭右键菜单，避免层叠交互冲突。 */
  function handleNodeClick(node: GraphNode) {
    openPersonaDetail(node.id);
    setContextMenu(null);
  }

  /**
   * 双击节点：切换聚焦态。
   * 业务语义：同一节点再次双击视为“退出临时聚焦”，而不是维持原状态。
   */
  function handleNodeDoubleClick(node: GraphNode) {
    setFocusedNodeId(prev => (prev === node.id ? null : node.id));
  }

  /** 右键节点：记录节点与屏幕坐标以渲染上下文菜单。 */
  function handleNodeRightClick(node: GraphNode, position: { x: number; y: number }) {
    setContextMenu({ node, position });
  }

  /**
   * 点击背景：清空临时交互态。
   * 为什么一次性清空多个状态：
   * - 背景点击是“退出上下文操作”的统一动作；
   * - 若只清空其中一项，用户会看到残留高亮/菜单，形成状态错觉。
   */
  function handleBackgroundClick() {
    // 背景点击是高频操作：仅在状态非空时才提交更新，避免 no-op 触发整树重渲染。
    setSelectedPersona(prev => prev === null ? prev : null);
    setFocusedNodeId(prev => prev === null ? prev : null);
    setContextMenu(prev => prev === null ? prev : null);
    setHighlightPathIds(prev => prev.size === 0 ? prev : new Set());
    setHighlightPathEdgeIds(prev => prev.size === 0 ? prev : new Set());
  }

  /** 清空路径高亮（仅在当前存在高亮时更新状态）。 */
  const clearHighlightPath = useCallback(() => {
    setHighlightPathIds(prev => prev.size === 0 ? prev : new Set());
    setHighlightPathEdgeIds(prev => prev.size === 0 ? prev : new Set());
  }, []);

  /** 设置路径高亮（与当前集合一致时保持引用，避免无意义 rerender）。 */
  const setHighlightPath = useCallback((nextPathNodeIds: Set<string>, nextPathEdgeIds: Set<string>) => {
    setHighlightPathIds(prev => isSameIdSet(prev, nextPathNodeIds) ? prev : nextPathNodeIds);
    setHighlightPathEdgeIds(prev => isSameIdSet(prev, nextPathEdgeIds) ? prev : nextPathEdgeIds);
  }, []);

  /**
   * 通过人物名查找节点 ID。
   * 匹配策略：
   * 1) 先精确匹配（避免大小写归一造成误匹配）；
   * 2) 再大小写不敏感匹配（提升输入容错）。
   */
  function findPersonaIdByName(name: string): string | null {
    const normalizedName = name.trim();
    if (!normalizedName) {
      // 空输入直接失败，避免触发无意义路径查询。
      return null;
    }

    // 先做精确匹配，保证同名大小写场景的可控性。
    const exactMatch = snapshot.nodes.find(node => node.name === normalizedName);
    if (exactMatch) {
      return exactMatch.id;
    }

    // 再做不区分大小写匹配，提高输入容错。
    const lowerCaseName = normalizedName.toLowerCase();
    const caseInsensitiveMatch = snapshot.nodes.find(node => node.name.toLowerCase() === lowerCaseName);
    return caseInsensitiveMatch?.id ?? null;
  }

  /**
   * 路径查找：
   * 1) 把用户输入姓名映射为节点 ID；
   * 2) 若映射失败，直接清空高亮并返回；
   * 3) 调后端查询最短路径，成功则高亮路径节点与关系边；
   * 4) 查询失败或未找到路径时清空高亮，避免显示过期状态。
   */
  async function handlePathFind(sourceName: string, targetName: string): Promise<boolean> {
    const sourcePersonaId = findPersonaIdByName(sourceName);
    const targetPersonaId = findPersonaIdByName(targetName);
    if (!sourcePersonaId || !targetPersonaId) {
      // 任一端映射失败都清空旧高亮，避免保留上一次成功路径造成误导。
      clearHighlightPath();
      toast.warning("未匹配到输入人物，请检查姓名后重试");
      return false;
    }

    try {
      const result = await searchPersonaPath({
        bookId,
        sourcePersonaId,
        targetPersonaId
      });
      if (result.found) {
        const pathNodeIds = new Set<string>(result.nodes.map(node => node.id));
        const pathEdgeIds = new Set<string>(result.edges.map(edge => edge.id));
        setHighlightPath(pathNodeIds, pathEdgeIds);
        setPathAutoFitVersion(prev => prev + 1);
        return true;
      }
      clearHighlightPath();
      toast.info("两者之间暂未找到可达路径");
      return false;
    } catch {
      // 异常时不抛出到 UI 层，保持主视图稳定。
      clearHighlightPath();
      toast.error("路径查找失败，请稍后重试");
      return false;
    }
  }

  /**
   * 图谱导出入口（FG-01）。
   * - JSON：直接序列化当前快照下载；
   * - SVG：序列化 SVG 元素（内联 CSS 变量解析后），以 .svg 文件下载；
   * - PNG：将 SVG 渲染到 canvas，导出 .png 文件；背景填充白色保证可打开性。
   */
  function handleExport(format: "png" | "svg" | "json") {
    if (format === "json") {
      // 导出当前前端快照（含筛选前原始数据），便于问题复现与离线分析。
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-${bookId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // 从 DOM 中取图谱 SVG 元素。
    const svgEl = document.querySelector<SVGSVGElement>(".force-graph svg");
    if (!svgEl) return;

    // 将 SVG 中所有 CSS 变量引用替换为 computed 值，保证导出后颜色可见。
    const computedStyle = getComputedStyle(document.documentElement);
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgEl);
    svgStr = svgStr.replace(/var\(--([^)]+)\)/g, (_, varName: string) => {
      const val = computedStyle.getPropertyValue(`--${varName}`).trim();
      return val || "#888888";
    });

    if (format === "svg") {
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-${bookId}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // PNG：将 SVG 渲染到 canvas。
    const imgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const imgUrl = URL.createObjectURL(imgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svgEl.width.baseVal.value || 1200;
      canvas.height = svgEl.height.baseVal.value || 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(imgUrl); return; }
      // 白色背景，避免透明通道造成黑色背景。
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(imgUrl);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `graph-${bookId}.png`;
      a.click();
    };
    img.onerror = () => { URL.revokeObjectURL(imgUrl); };
    img.src = imgUrl;
  }

  /**
   * 切换全屏显示。
   * 这是浏览器专属 API，因此该逻辑必须驻留在 Client Component。
   */
  function handleFullscreen() {
    const el = document.querySelector(".graph-view-container");
    if (el) {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void el.requestFullscreen();
      }
    }
  }

  /**
   * 证据点击回调。
   * 触发链路：人物详情/时间轴证据 -> 打开阅读侧栏 -> 按需加载章节并可定位段落。
   * FG-06: 同时维护 evidenceList 与游标，支持多证据前后导航。
   */
  function handleEvidenceClick(
    chapterId   : string,
    paraIndex?  : number,
    allEvidence?: Array<{ chapterId: string; paraIndex?: number }>,
    clickedIndex?: number
  ) {
    if (allEvidence && allEvidence.length > 1) {
      // 多证据模式：进入游标导航（FG-06）。
      openEvidenceReader(allEvidence, clickedIndex ?? 0);
    } else {
      // 单证据模式：直接打开。
      setTextReader({
        chapterId,
        paraIndex,
        promise: fetchChapterContent(bookId, chapterId, paraIndex)
      });
    }
  }

  /**
   * FG-06: 打开含多证据游标的原文面板。
   * @param list 完整证据列表，每项为 { chapterId, paraIndex }。
   * @param startIndex 初始聚焦证据下标（默认 0）。
   */
  function openEvidenceReader(
    list: Array<{ chapterId: string; paraIndex?: number }>,
    startIndex = 0
  ) {
    if (list.length === 0) return;
    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    setEvidenceList(list);
    setEvidenceIndex(idx);
    const item = list[idx];
    setTextReader({
      chapterId: item.chapterId,
      paraIndex: item.paraIndex,
      promise  : fetchChapterContent(bookId, item.chapterId, item.paraIndex)
    });
  }

  /** FG-06: 跳到上一条证据。 */
  function handleEvidencePrev() {
    if (evidenceList.length === 0 || evidenceIndex <= 0) return;
    const nextIdx = evidenceIndex - 1;
    const item = evidenceList[nextIdx];
    setEvidenceIndex(nextIdx);
    setTextReader({
      chapterId: item.chapterId,
      paraIndex: item.paraIndex,
      promise  : fetchChapterContent(bookId, item.chapterId, item.paraIndex)
    });
  }

  /** FG-06: 跳到下一条证据。 */
  function handleEvidenceNext() {
    if (evidenceList.length === 0 || evidenceIndex >= evidenceList.length - 1) return;
    const nextIdx = evidenceIndex + 1;
    const item = evidenceList[nextIdx];
    setEvidenceIndex(nextIdx);
    setTextReader({
      chapterId: item.chapterId,
      paraIndex: item.paraIndex,
      promise  : fetchChapterContent(bookId, item.chapterId, item.paraIndex)
    });
  }

  /**
   * FG-04: 节点拖拽结束后防抖保存布局坐标到后端。
   * 防抖间隔 1s，避免批量拖拽产生请求风暴；失败时 toast 提示用户。
   */
  const handleNodeDragEnd = useCallback((positions: Array<{ id: string; x: number; y: number }>) => {
    if (layoutSaveTimerRef.current) {
      clearTimeout(layoutSaveTimerRef.current);
    }
    layoutSaveTimerRef.current = setTimeout(() => {
      const nodes: GraphLayoutNodeInput[] = positions.map(p => ({
        personaId: p.id,
        x        : p.x,
        y        : p.y
      }));
      void updateGraphLayout(bookId, nodes).catch(() => {
        // 保存失败时静默处理（网络异常为暂时性，不阻断用户继续操作图谱）。
        // 如需可见提示，可在此引入 toast.error。
      });
    }, 1000);
  }, [bookId]);

  return (
    <div className="graph-view-container flex h-full w-full flex-col overflow-hidden">
      {/* 图谱专属顶部信息头：展示书籍名称、作者、节点数、关系数与章节进度。 */}
      <GraphPageHeader
        bookTitle={bookTitle}
        bookAuthor={bookAuthor}
        characterCount={personaCount}
        nodeCount={snapshot.nodes.length}
        edgeCount={snapshot.edges.length}
        currentChapter={currentChapter}
        totalChapters={totalChapters}
        chapterUnit={chapterUnit}
      />

      {/* 图谱画布区域：相对定位容器，承载所有绝对定位的子组件。 */}
      <div className="relative flex-1 overflow-hidden">
        {/* 切章节时的局部加载遮罩：避免误触并提示数据正在刷新。 */}
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-(--color-graph-bg)/50">
            <div className="rounded-lg bg-card px-4 py-2 text-sm text-foreground shadow-lg">
              加载中...
            </div>
          </div>
        )}

        {/* 图谱主画布：节点/边渲染与核心交互事件都由该组件承接。 */}
        <ForceGraph
          snapshot={snapshot}
          theme={resolvedTheme}
          chapterCap={currentChapter}
          filter={filter}
          layoutMode={layoutMode}
          focusedNodeId={focusedNodeId}
          activeNodeId={selectedPersona?.id ?? null}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeRightClick={handleNodeRightClick}
          onEdgeHover={setHoveredEdge}
          onBackgroundClick={handleBackgroundClick}
          highlightPathIds={highlightPathIds.size > 0 ? highlightPathIds : undefined}
          highlightPathEdgeIds={highlightPathEdgeIds.size > 0 ? highlightPathEdgeIds : undefined}
          pathAutoFitVersion={pathAutoFitVersion}
          onNodeDragEnd={handleNodeDragEnd}
          edgeTypeColorMap={edgeTypeColorMap}
        />

        {/* 左侧工具栏：筛选、搜索、路径查找、布局切换、导出、全屏。 */}
        <GraphToolbar
          filter={filter}
          onFilterChange={setFilter}
          layoutMode={layoutMode}
          onLayoutChange={setLayoutMode}
          onPathFind={handlePathFind}
          onExport={handleExport}
          onFullscreen={handleFullscreen}
          availableRelationTypes={availableRelationTypes}
        />

        {/* 左下角关系类型图例：直观展示 5 种语义分组与对应颜色。 */}
        <GraphLegend edgeTypeColorMap={legendColorMap} />

        {/* 边悬停提示：显示关系类型与权重。悬浮提示设置 pointer-events-none，避免挡住画布事件。 */}
        {hoveredEdge && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs shadow-md"
            style={{ borderColor: "var(--color-border)", borderWidth: 1 }}
          >
            <span className="text-foreground">{hoveredEdge.type}</span>
            <span className="ml-2 text-muted-foreground">
              权重 {hoveredEdge.weight}
            </span>
          </div>
        )}

        {/* 底部章节时间轴：控制图谱时间切片。只有章节数 > 1 才展示，避免无意义控件。 */}
        {totalChapters > 1 && (
          <ChapterTimeline
            totalChapters={totalChapters}
            currentChapter={currentChapter}
          onChapterChange={handleChapterChange}
          chapterUnit={chapterUnit}
        />
      )}

      {/* 人物详情侧栏：使用 Suspense 包裹 Promise，减少主图阻塞。 */}
      {selectedPersona && (
        <AsyncErrorBoundary fallback={<PanelFallback message="人物详情加载失败" onClose={() => setSelectedPersona(null)} />}>
          <Suspense fallback={<PanelFallback message="人物详情加载中..." onClose={() => setSelectedPersona(null)} />}>
            <PersonaDetailPanel
              personaPromise={selectedPersona.promise}
              bookId={bookId}
              onClose={() => setSelectedPersona(null)}
              onEvidenceClick={handleEvidenceClick}
              onEditClick={(id) => {
                void id; // Phase 4: inline editing
              }}
            />
          </Suspense>
        </AsyncErrorBoundary>
      )}

      {/* 右键上下文菜单：承接人物快捷操作。 */}
      {contextMenu && (
        <GraphContextMenu
          node={contextMenu.node}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onViewDetail={() => openPersonaDetail(contextMenu.node.id)}
          onEdit={() => {
            // FG-05: 跳转人物审核页，admin 可在 review 面板内直接编辑。
            setContextMenu(null);
            router.push(`/admin/review/${bookId}`);
          }}
          onMerge={() => {
            // FG-05: 跳转审核合并视图。
            setContextMenu(null);
            router.push(`/admin/review/${bookId}`);
          }}
          onDelete={() => {
            // FG-05: 删除人物节点后刷新图谱。
            const nodeId = contextMenu.node.id;
            const nodeName = contextMenu.node.name;
            setContextMenu(null);
            void (async () => {
              try {
                await deletePersona(nodeId);
                toast.success(`已删除人物：${nodeName}`);
                await fetchGraph(currentChapter);
              } catch {
                toast.error("删除失败，请稍后重试");
              }
            })();
          }}
        />
      )}

      {/* 原文阅读侧栏：支持按段落定位高亮。FG-06: 传入证据前后导航回调。 */}
      {textReader && (
        <AsyncErrorBoundary fallback={<ReaderPanelFallback message="原文加载失败" onClose={() => setTextReader(null)} />}>
          <Suspense fallback={<ReaderPanelFallback message="原文加载中..." onClose={() => setTextReader(null)} />}>
            <TextReaderPanel
              bookId={bookId}
              chapterPromise={textReader.promise}
              highlightParaIndex={textReader.paraIndex}
              onClose={() => { setTextReader(null); setEvidenceList([]); setEvidenceIndex(0); }}
              onPrev={evidenceList.length > 1 && evidenceIndex > 0 ? handleEvidencePrev : undefined}
              onNext={evidenceList.length > 1 && evidenceIndex < evidenceList.length - 1 ? handleEvidenceNext : undefined}
            />
          </Suspense>
        </AsyncErrorBoundary>
      )}
      </div>
    </div>
  );
}
