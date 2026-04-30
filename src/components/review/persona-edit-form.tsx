"use client";

/**
 * =============================================================================
 * 文件定位（角色资料工作台子组件：人物信息编辑表单）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/persona-edit-form.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 该文件是角色资料工作台中的 Client Component；
 * - 用于在角色资料工作台中对单个人物记录执行“局部字段修正”。
 *
 * 业务职责：
 * 1) 展示人物可编辑字段（姓名、别名、籍贯、置信度）；
 * 2) 仅提交被修改字段（Patch 语义），避免无意义全量覆盖；
 * 3) 保存成功后回调父组件刷新，失败时展示错误。
 *
 * 为什么必须在客户端：
 * - 依赖输入框双向绑定与实时交互状态（saving/error）；
 * - 依赖点击事件触发保存/取消。
 *
 * 维护注意：
 * - 本组件不做复杂业务校验，校验边界主要在后端；
 * - “未改动即取消”是产品交互策略，不是技术限制。
 * =============================================================================
 */

import { useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { patchPersona } from "@/lib/services/personas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PersonaEditFormProps {
  /** 被编辑人物的主键 ID。 */
  personaId  : string;
  /**
   * 初始人物数据（来自父层当前行数据）。
   * 说明：这里是“编辑基线”，用于后续差异比较判断是否需要提交字段。
   */
  initialData: {
    /** 人物主名。 */
    name      : string;
    /** 别名数组（服务端结构）。 */
    aliases   : string[];
    /** 籍贯，可空。 */
    hometown  : string | null;
    /** 置信度（0~1）。 */
    confidence: number;
  };
  /** 保存成功回调：通常用于关闭编辑态并刷新列表。 */
  onSaved : () => void;
  /** 取消回调：退出当前编辑态。 */
  onCancel: () => void;
}

export function PersonaEditForm({
  personaId,
  initialData,
  onSaved,
  onCancel
}: PersonaEditFormProps) {
  /** 姓名输入值，默认取初始姓名。 */
  const [name, setName] = useState(initialData.name);
  /** 别名编辑态字符串：用顿号拼接，便于中文场景人工输入。 */
  const [aliases, setAliases] = useState(initialData.aliases.join("、"));
  /** 籍贯输入值：后端 null 在输入框层转换为空字符串。 */
  const [hometown, setHometown] = useState(initialData.hometown ?? "");
  /** 置信度输入值：把 0~1 转为 0~100 的可编辑百分比字符串。 */
  const [confidence, setConfidence] = useState(
    String((initialData.confidence * 100).toFixed(0))
  );
  /** 是否正在保存，控制按钮禁用与 loading 动效。 */
  const [saving, setSaving] = useState(false);
  /** 错误信息：保存失败时展示，可空。 */
  const [error, setError] = useState<string | null>(null);

  /**
   * 提交保存。
   * 业务步骤：
   * 1) 进入 saving 态并清空旧错误；
   * 2) 构建 Patch Body（只放“与初始值不同”的字段）；
   * 3) 若无任何改动，直接走取消流程；
   * 4) 调用 patch 接口；
   * 5) 成功回调 onSaved，失败写入 error，最后退出 saving 态。
   */
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // body 使用弱约束对象是为了支持“按需字段”Patch，不要求固定全量结构。
      const body: Record<string, unknown> = {};
      if (name !== initialData.name) body.name = name;

      // 支持中文顿号/中英文逗号分隔，降低录入/校对人员输入负担。
      const newAliases = aliases
        .split(/[、,，]/)
        .map(s => s.trim())
        .filter(Boolean);
      // 通过序列化比较保持“顺序敏感”的数组差异判断，避免不必要写入。
      if (JSON.stringify(newAliases) !== JSON.stringify(initialData.aliases)) {
        body.aliases = newAliases;
      }

      // 输入层空字符串回转为 null，保持与后端可空字段语义一致。
      const newHometown = hometown.trim() || null;
      if (newHometown !== initialData.hometown) body.hometown = newHometown;

      // 输入层百分比转回 0~1 浮点；阈值比较用于规避浮点误差导致的误判。
      const newConfidence = Number(confidence) / 100;
      if (Math.abs(newConfidence - initialData.confidence) > 0.001) {
        body.confidence = newConfidence;
      }

      // 分支：无变更时不发请求，直接退出，减少无效网络与后端写放大。
      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }

      await patchPersona(personaId, body);
      onSaved();
    } catch (err) {
      // 优先使用 Error.message；非 Error 场景回退统一客户端错误解析文案。
      setError(err instanceof Error ? err.message : readClientApiErrorMessage(null, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-primary bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">姓名</span>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">别名（顿号分隔）</span>
          <Input value={aliases} onChange={e => setAliases(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">籍贯</span>
          <Input
            value={hometown}
            onChange={e => setHometown(e.target.value)}
            placeholder="可选"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">置信度 (%)</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={confidence}
            onChange={e => setConfidence(e.target.value)}
          />
        </label>
      </div>
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
