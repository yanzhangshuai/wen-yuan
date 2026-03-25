"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface LoginSuccessData {
  redirect?: string;
}

const LOGIN_ERROR_MESSAGE = "账号或密码错误";

/**
 * 仅允许站内相对路径，避免把登录后的跳转目标交给任意外部地址。
 */
function normalizeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  if (value === "/login" || value.startsWith("/login?")) {
    return "/";
  }

  return value;
}

function hasRedirectData(value: unknown): value is LoginSuccessData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const redirectValue = Reflect.get(value, "redirect");
  return typeof redirectValue === "undefined" || typeof redirectValue === "string";
}

function extractRedirectFromPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const successValue = Reflect.get(payload, "success");
  const dataValue = Reflect.get(payload, "data");

  if (successValue !== true || !hasRedirectData(dataValue)) {
    return null;
  }

  return dataValue.redirect ?? null;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect = normalizeRedirect(searchParams.get("redirect"));

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identifier,
          password,
          redirect
        })
      });

      const payload = await response.json();
      const nextRedirect = extractRedirectFromPayload(payload);

      if (!response.ok || nextRedirect === null) {
        setErrorMessage(LOGIN_ERROR_MESSAGE);
        return;
      }

      window.location.replace(normalizeRedirect(nextRedirect || redirect));
    } catch {
      setErrorMessage(LOGIN_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page flex min-h-screen items-center justify-center px-6 py-12">
      <div className="login-page-shell w-full max-w-md">
        <Card className="overflow-hidden border-[color:color-mix(in_srgb,var(--border)_75%,white)] bg-[color:color-mix(in_srgb,var(--card)_94%,white)] shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-3 border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--card)_86%,var(--accent))]">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              Admin Access
            </p>
            <div className="space-y-1">
              <CardTitle className="text-2xl">管理员登录</CardTitle>
              <CardDescription>
                使用管理员邮箱或用户名登录后台。
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {errorMessage ? (
              <Alert aria-live="polite" variant="destructive">
                <AlertTitle>登录失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <form className="login-page-form space-y-5" onSubmit={handleSubmit}>
              <input type="hidden" name="redirect" value={redirect} />

              <FormItem>
                <FormLabel htmlFor="identifier">邮箱或用户名</FormLabel>
                <Input
                  id="identifier"
                  name="identifier"
                  autoComplete="username"
                  placeholder="admin@example.com"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </FormItem>

              <FormItem>
                <FormLabel htmlFor="password">密码</FormLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <FormMessage aria-live="polite">
                  {isSubmitting ? "正在验证管理员身份，请稍候。" : "\u00A0"}
                </FormMessage>
              </FormItem>

              <Button
                className="w-full"
                type="submit"
                size="lg"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "登录中..." : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
