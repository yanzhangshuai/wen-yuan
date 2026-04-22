import { AlertTriangle } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";
import type { ReviewRelationPairWarningsDto } from "@/lib/services/relation-editor";
import { cn } from "@/lib/utils";

interface RelationWarningBannerProps {
  warnings              : ReviewRelationPairWarningsDto;
  directionConflictText?: string;
  intervalConflictText? : string;
  className?            : string;
}

const DEFAULT_DIRECTION_CONFLICT_TEXT = "当前人物关系对存在方向冲突，请逐条核对关系方向。";
const DEFAULT_INTERVAL_CONFLICT_TEXT = "当前人物关系对存在生效区间冲突，请核对章节区间。";

/**
 * 关系详情的轻量风险提示。
 * warning flags 由 query service 预计算，组件只负责展示，不阻塞编辑或保存动作。
 */
export function RelationWarningBanner({
  warnings,
  directionConflictText = DEFAULT_DIRECTION_CONFLICT_TEXT,
  intervalConflictText = DEFAULT_INTERVAL_CONFLICT_TEXT,
  className
}: RelationWarningBannerProps) {
  const messages = [
    warnings.directionConflict ? directionConflictText : null,
    warnings.intervalConflict ? intervalConflictText : null
  ].filter((message): message is string => message !== null);

  if (messages.length === 0) {
    return null;
  }

  return (
    <Alert className={cn("border-amber-200 bg-amber-50 text-amber-950", className)}>
      <AlertTriangle className="text-amber-600" />
      <AlertTitle>关系冲突提示</AlertTitle>
      <AlertDescription>
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}
