"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface FocusOnlySwitchProps {
  checked         : boolean;
  onCheckedChange : (next: boolean) => void;
  disabled       ?: boolean;
}

export function FocusOnlySwitch({ checked, onCheckedChange, disabled }: FocusOnlySwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id              ="focus-only-switch"
        checked         ={checked}
        onCheckedChange ={onCheckedChange}
        disabled        ={disabled}
        aria-label      ="只看当前角色相关 claim"
      />
      <Label htmlFor="focus-only-switch" className="cursor-pointer text-sm text-muted-foreground">
        只看当前角色
      </Label>
    </div>
  );
}
