"use client";

/**
 * =============================================================================
 * 文件定位（设计系统 - React Hook Form 适配层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/ui/form.tsx`
 *
 * 在项目中的角色：
 * - 将 `react-hook-form` 的字段状态与项目 UI 组件语义（Label/Description/Message）对齐；
 * - 为业务表单提供统一可访问性属性（`htmlFor`、`aria-describedby`、`aria-invalid`）。
 *
 * 业务意义：
 * - 调用方只需要声明 `FormField` + 控件结构，不必手动拼接字段 id 与错误文案关联；
 * - 统一错误呈现方式，降低“同一表单不同字段表现不一致”的维护风险。
 *
 * 维护约束：
 * - `FormFieldContext` 和 `FormItemContext` 的 id 命名规则是上下游契约；
 * - 读屏器依赖 `aria-describedby` 关联链路，请勿随意删改。
 * =============================================================================
 */

import * as React from "react";
import type * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  /** 当前字段名（与 react-hook-form 的 path 对齐）。 */
  name: TName
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  // 先把字段名放入上下文，再渲染 Controller，便于子组件读取当前字段状态。
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    // 防御式约束：必须在 FormField 内调用，才能拿到 name 与校验状态。
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name             : fieldContext.name,
    formItemId       : `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId    : `${id}-form-item-message`,
    ...fieldState
  };
};

type FormItemContextValue = {
  /** 当前字段容器唯一 id，用于拼接 label/description/message 关联 id。 */
  id: string
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        // 无错误时只关联描述；有错误时追加 message id，辅助技术可读到错误信息。
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  // 优先展示字段校验错误；若无错误则回退到调用方传入 children。
  const body = error ? String(error?.message ?? "") : props.children;

  if (!body) {
    // 无内容不渲染，避免空白错误行影响表单节奏。
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField
};
