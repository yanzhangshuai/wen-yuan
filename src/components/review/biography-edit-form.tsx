"use client";

/**
 * =============================================================================
 * 文件定位（审核中心子组件：传记记录编辑表单）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/biography-edit-form.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 审核页面的 Client Component；
 * - 用于编辑单条传记/时间线记录（类别、标题、地点、事件描述）。
 *
 * 业务职责：
 * 1) 提供传记字段人工修正入口；
 * 2) 以 Patch 方式仅提交变更字段；
 * 3) 在保存成功后通知父层刷新，保持列表一致。
 *
 * 为什么是客户端组件：
 * - 表单输入与按钮交互依赖浏览器事件；
 * - 需要本地 `saving/error` 状态即时反馈。
 *
 * 维护注意：
 * - `CATEGORY_OPTIONS` 体现当前前端可编辑的业务类别集合；
 * - 若后端新增类别但前端不更新，可能出现“可显示不可编辑”的体验差异。
 * =============================================================================
 */

import { useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { patchBiography } from "@/lib/services/biography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_OPTIONS = [
  /** 出生事件。 */
  { value: "BIRTH", label: "出生" },
  /** 科举相关经历。 */
  { value: "EXAM", label: "科举" },
  /** 任职与仕途经历。 */
  { value: "CAREER", label: "仕途" },
  /** 行旅迁徙经历。 */
  { value: "TRAVEL", label: "行旅" },
  /** 社交/交往事件。 */
  { value: "SOCIAL", label: "社交" },
  /** 逝世事件。 */
  { value: "DEATH", label: "逝世" },
  /** 其他事件。 */
  { value: "EVENT", label: "事件" }
];

interface BiographyEditFormProps {
  /** 被编辑传记记录 ID。 */
  biographyId: string;
  /** 编辑初始值，用于差异比较。 */
  initialData: {
    /** 事件类别编码。 */
    category: string;
    /** 事件标题，可空。 */
    title   : string | null;
    /** 事件地点，可空。 */
    location: string | null;
    /** 事件正文描述。 */
    event   : string;
  };
  /** 保存成功回调。 */
  onSaved : () => void;
  /** 取消编辑回调。 */
  onCancel: () => void;
}

export function BiographyEditForm({
  biographyId,
  initialData,
  onSaved,
  onCancel
}: BiographyEditFormProps) {
  /** 类别输入状态。 */
  const [category, setCategory] = useState(initialData.category);
  /** 标题输入状态（null -> ""）。 */
  const [title, setTitle] = useState(initialData.title ?? "");
  /** 地点输入状态（null -> ""）。 */
  const [location, setLocation] = useState(initialData.location ?? "");
  /** 事件描述输入状态。 */
  const [event, setEvent] = useState(initialData.event);
  /** 保存中状态。 */
  const [saving, setSaving] = useState(false);
  /** 保存失败错误信息。 */
  const [error, setError] = useState<string | null>(null);

  /**
   * 提交保存。
   * 设计目标：只提交差异字段，避免无意义覆盖写入。
   */
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (category !== initialData.category) body.category = category;

      // 输入为空时回转为 null，保持与后端可空字段语义一致。
      const newTitle = title.trim() || null;
      if (newTitle !== initialData.title) body.title = newTitle;

      // 同上：地点字段采用 null 表示“无地点”。
      const newLocation = location.trim() || null;
      if (newLocation !== initialData.location) body.location = newLocation;

      // 事件正文按原字符串比较，保留用户输入中的空格差异。
      if (event !== initialData.event) body.event = event;

      // 无变更即退出，不发请求。
      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }

      await patchBiography(biographyId, body);
      onSaved();
    } catch (err) {
      // 优先展示服务端错误，兜底使用统一文案。
      setError(err instanceof Error ? err.message : readClientApiErrorMessage(null, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-primary bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">类别</span>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            {CATEGORY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">标题</span>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="可选" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">地点</span>
          <Input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="可选"
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">事件描述</span>
        <Textarea
          value={event}
          onChange={e => setEvent(e.target.value)}
          rows={2}
        />
      </label>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <XIcon size={14} />
          <span className="ml-1">取消</span>
        </Button>
        <Button size="sm" onClick={() => { void handleSave(); }} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          <span className="ml-1">保存</span>
        </Button>
      </div>
    </div>
  );
}
