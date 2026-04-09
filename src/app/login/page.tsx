"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, ArrowRight, Github, Loader2, User } from "lucide-react";

import { ThemeToggle } from "@/components/theme";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { login } from "@/lib/services/auth";

/**
 * =============================================================================
 * 文件定位（登录页面）
 * -----------------------------------------------------------------------------
 * 本文件是 `app/login/page.tsx`，对应路由 `/login` 的页面组件。
 *
 * 为什么必须是 Client Component（`"use client"`）：
 * 1) 需要使用 React Hook（useState/useSearchParams）管理交互状态；
 * 2) 需要在浏览器端处理表单提交与跳转（window.location.replace）；
 * 3) 需要即时反馈 loading/error，不适合纯服务端静态渲染。
 *
 * 在 Next.js 渲染链路中的位置：
 * - 首屏 HTML 可由服务器预渲染；
 * - hydration 后由客户端接管交互；
 * - `Suspense + useSearchParams` 用于处理查询参数读取的异步边界。
 *
 * 核心业务目标：
 * - 支持管理员登录；
 * - 安全处理登录后重定向地址（只允许站内路径）；
 * - 在失败时给出统一且不泄漏账号状态的错误提示。
 *
 * 上游输入：
 * - URL 查询参数 `redirect`
 * - 用户输入 `identifier/password`
 *
 * 下游输出：
 * - 调用 `login` 服务请求 `/api/auth/login`
 * - 成功后跳转到目标页；失败后展示错误提示
 *
 * 维护注意：
 * - `normalizeRedirect` 是登录安全边界，不能放宽为外部 URL；
 * - `LOGIN_ERROR_MESSAGE` 采用统一文案，避免泄漏“账号是否存在”等信息；
 * - 当前“注册”Tab 为 UI 占位，不接入真实注册 API（是产品阶段选择）。
 * =============================================================================
 */
const LOGIN_ERROR_MESSAGE = "账号或密码错误";

/**
 * 仅允许站内相对路径，避免把登录后的跳转目标交给任意外部地址。
 */
function normalizeRedirect(value: string | null): string {
  // 空值或非法值回首页，保证跳转目标始终可控。
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  // 避免出现“登录后又回到登录页”造成流程循环。
  if (value === "/login" || value.startsWith("/login?")) {
    return "/";
  }

  return value;
}

export default function LoginPage() {
  return (
    // useSearchParams 在某些渲染阶段可能依赖异步边界，这里用 Suspense 提供稳定占位骨架。
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginSkeleton() {
  // 登录页查询参数尚未就绪时的过渡骨架，避免白屏。
  return (
    <main className="login-page flex min-h-screen items-center justify-center px-6 py-12">
      <div className="h-96 w-full max-w-md animate-pulse rounded-lg bg-muted/20" />
    </main>
  );
}

function LoginForm() {
  // 读取登录后目标地址，来源是 middleware 或上游页面拼接的 ?redirect=...
  const searchParams = useSearchParams();
  const redirect = normalizeRedirect(searchParams.get("redirect"));

  // identifier: 用户名/邮箱输入框状态（受控组件）。
  const [identifier, setIdentifier] = useState("");
  // password: 密码输入框状态（受控组件）。
  const [password, setPassword] = useState("");
  // isSubmitting: 提交中态，控制按钮禁用与 loading 文案，防重复提交。
  const [isSubmitting, setIsSubmitting] = useState(false);
  // errorMessage: 登录失败时展示给用户的提示文案。
  const [errorMessage, setErrorMessage] = useState("");
  // activeTab: 登录/注册页签状态（当前仅 login 具备业务功能）。
  const [activeTab, setActiveTab] = useState("login");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // 阻止浏览器默认表单提交，改为 SPA 异步请求流程。
    event.preventDefault();

    // 提交前先重置错误状态，避免旧错误残留。
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      // 调用客户端服务层，内部会请求 /api/auth/login 并返回服务端建议跳转地址。
      const nextRedirect = await login({ identifier, password, redirect });
      // 使用 replace 而非 push：登录页不应留在历史记录中，避免用户后退回到登录页。
      window.location.replace(normalizeRedirect(nextRedirect ?? redirect));
    } catch {
      // 业务策略：统一提示“账号或密码错误”，避免泄漏更细粒度认证失败原因。
      setErrorMessage(LOGIN_ERROR_MESSAGE);
    } finally {
      // 无论成功失败都要结束提交态，保证 UI 可继续操作。
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-layout flex min-h-screen">
      <div className="login-left relative hidden overflow-hidden bg-primary/5 lg:flex lg:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="mb-8">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                <span className="font-serif text-3xl font-bold text-primary">淵</span>
              </div>
              <span className="font-serif text-3xl font-bold text-foreground">文淵</span>
            </Link>
          </div>

          <h1 className="mb-6 font-serif text-4xl leading-tight font-bold text-foreground xl:text-5xl">
            探索古典文学的<br />
            <span className="text-primary">人物关系网络</span>
          </h1>

          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            基于AI技术，自动解析古典文献中的人物关系，构建可视化知识图谱，让千年典籍焕发新生。
          </p>

          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80">
                <span className="text-lg font-semibold text-primary">50+</span>
              </div>
              <span className="text-muted-foreground">部经典典籍</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80">
                <span className="text-lg font-semibold text-primary">10K+</span>
              </div>
              <span className="text-muted-foreground">历史人物</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80">
                <span className="text-lg font-semibold text-primary">50K+</span>
              </div>
              <span className="text-muted-foreground">人物关系</span>
            </div>
          </div>
        </div>

        <div className="absolute right-20 bottom-20 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-40 right-40 h-24 w-24 rounded-full bg-accent/5 blur-2xl" />
      </div>

      <div className="login-right flex flex-1 flex-col">
        <div className="flex items-center justify-between p-6">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="font-serif text-2xl font-bold text-primary">淵</span>
            <span className="font-serif text-xl font-bold">文淵</span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-8 grid w-full grid-cols-2">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="register">注册</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Card className="login-auth-shell border-0 shadow-none sm:border sm:shadow-sm">
                  <CardHeader className="space-y-1 px-0 sm:px-6">
                    <CardTitle className="text-2xl font-serif">欢迎回来</CardTitle>
                    <CardDescription>
                      登录您的账户以继续探索
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    {errorMessage ? (
                      <Alert aria-live="polite" variant="destructive" className="mb-4">
                        <AlertTitle>登录失败</AlertTitle>
                        <AlertDescription>{errorMessage}</AlertDescription>
                      </Alert>
                    ) : null}

                    <form className="space-y-4" onSubmit={(event) => { void handleSubmit(event); }}>
                      {/* 作为表单上下文保留 redirect，便于调试和无障碍工具读取当前目标信息。 */}
                      <input type="hidden" name="redirect" value={redirect} />

                      <div className="space-y-2">
                        <Label htmlFor="identifier">邮箱</Label>
                        <div className="relative">
                          <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="identifier"
                            name="identifier"
                            autoComplete="username"
                            placeholder="your@email.com"
                            className="pl-9"
                            value={identifier}
                            // 受控输入：每次变更同步到本地状态，确保提交时取到最新值。
                            onChange={(event) => setIdentifier(event.target.value)}
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">密码</Label>
                          <Link href="/forgot-password" className="interactive-text-link text-sm text-primary hover:underline">
                            忘记密码？
                          </Link>
                        </div>
                        <div className="relative">
                          <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="pl-9"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            // 提交中禁用输入，避免请求进行中用户继续修改造成状态困惑。
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox id="remember" />
                        <Label htmlFor="remember" className="text-sm font-normal">
                          记住我
                        </Label>
                      </div>

                      <Button className="w-full" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                        {/* isSubmitting 驱动按钮视觉与可达性语义，提升交互确定性。 */}
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            登录中...
                          </>
                        ) : (
                          <>
                            登录
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-4 px-0 sm:px-6">
                    <div className="relative w-full">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="login-divider-pill bg-background px-2 text-muted-foreground">
                          或者
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full">
                      <Github className="mr-2 h-4 w-4" />
                      使用 GitHub 登录
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              <TabsContent value="register">
                <Card className="login-auth-shell border-0 shadow-none sm:border sm:shadow-sm">
                  <CardHeader className="space-y-1 px-0 sm:px-6">
                    <CardTitle className="text-2xl font-serif">创建账户</CardTitle>
                    <CardDescription>
                      注册以开始使用文淵
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    <form className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name">用户名</Label>
                        <div className="relative">
                          <User className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="reg-name" type="text" placeholder="您的用户名" className="pl-9" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reg-email">邮箱</Label>
                        <div className="relative">
                          <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="reg-email" type="email" placeholder="your@email.com" className="pl-9" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reg-password">密码</Label>
                        <div className="relative">
                          <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="reg-password" type="password" placeholder="••••••••" className="pl-9" />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox id="terms" />
                        <Label htmlFor="terms" className="text-sm font-normal">
                          我同意{" "}
                          <Link href="/terms" className="interactive-text-link text-primary hover:underline">
                            服务条款
                          </Link>
                          {" "}和{" "}
                          <Link href="/privacy" className="interactive-text-link text-primary hover:underline">
                            隐私政策
                          </Link>
                        </Label>
                      </div>

                      <Button className="w-full" type="button">
                        {/* 当前阶段注册流程未接后端，按钮仅展示，不触发提交。 */}
                        创建账户
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-4 px-0 sm:px-6">
                    <div className="relative w-full">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="login-divider-pill bg-background px-2 text-muted-foreground">
                          或者
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full">
                      <Github className="mr-2 h-4 w-4" />
                      使用 GitHub 注册
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="p-6 text-center text-sm text-muted-foreground">
          <p>
            继续即表示您同意我们的{" "}
            <Link href="/terms" className="interactive-text-link text-primary hover:underline">服务条款</Link>
            {" "}和{" "}
            <Link href="/privacy" className="interactive-text-link text-primary hover:underline">隐私政策</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
