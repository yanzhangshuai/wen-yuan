"use client";

/**
 * 技能管理：AI 生成技能弹框。
 * 输入用途描述（必填）+ 可选名称/分类/范围，调用 POST /api/admin/skills/generate，
 * 生成 DRAFT 技能后回调 onCreated，由父级刷新列表并选中。
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminModels } from "@/hooks/use-admin-models";
import { generateSkillByAi } from "@/lib/services/skills";

import { SCOPE_OPTIONS } from "./constants";

interface AiGenerateDialogProps {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  /** 生成成功回调（携带新技能 id，父级负责选中）。 */
  onCreated   : (skillId: string) => void;
}

export function AiGenerateDialog({ open, onOpenChange, onCreated }: AiGenerateDialogProps) {
  const { toast } = useToast();
  const { models, loading: modelsLoading } = useAdminModels({ onlyEnabled: true });
  const [purpose, setPurpose] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("GLOBAL");
  const [generating, setGenerating] = useState(false);

  const hasUsableModel = !modelsLoading && models.length > 0;

  function resetForm() {
    setPurpose("");
    setName("");
    setScope("GLOBAL");
  }

  async function handleSubmit() {
    if (!purpose.trim()) {
      toast({ title: "请描述技能用途", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const result = await generateSkillByAi({
        purpose: purpose.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(scope ? { scope } : {})
      });
      toast({ title: "技能已生成", description: `「${result.slug}」已创建并启用，可直接编辑` });
      resetForm();
      onOpenChange(false);
      onCreated(result.skillId);
    } catch (error) {
      toast({
        title      : "生成失败",
        description: error instanceof Error ? error.message : "请检查模型配置后重试",
        variant    : "destructive"
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); }}> 
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-primary h-4 w-4" />
            AI 生成技能
          </DialogTitle>
          <DialogDescription>
            描述技能用途，系统默认模型将生成一份 skill MD 文档（frontmatter + 正文）并默认启用。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="skill-purpose">技能用途（必填）</Label>
            <Textarea
              id="skill-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="如：科举相关的称谓与关系码知识；明清官场职称与上下级关系……"
              rows={4}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="skill-name">名称（可选）</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="留空由 AI 拟定"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>作用范围</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!hasUsableModel && !modelsLoading && (
            <p className="text-destructive text-xs">
              当前没有可用的默认模型，请先在「模型管理」配置并启用一个模型。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={generating || !hasUsableModel}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "生成中..." : "生成技能"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
