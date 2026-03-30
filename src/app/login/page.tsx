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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <main className="login-page flex min-h-screen items-center justify-center px-6 py-12">
      <div className="h-96 w-full max-w-md animate-pulse rounded-lg bg-muted/20" />
    </main>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = normalizeRedirect(searchParams.get("redirect"));

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState("login");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const nextRedirect = await login({ identifier, password, redirect });
      window.location.replace(normalizeRedirect(nextRedirect ?? redirect));
    } catch {
      setErrorMessage(LOGIN_ERROR_MESSAGE);
    } finally {
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
                            onChange={(event) => setIdentifier(event.target.value)}
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">密码</Label>
                          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
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
                          <Link href="/terms" className="text-primary hover:underline">
                            服务条款
                          </Link>
                          {" "}和{" "}
                          <Link href="/privacy" className="text-primary hover:underline">
                            隐私政策
                          </Link>
                        </Label>
                      </div>

                      <Button className="w-full" type="button">
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
            <Link href="/terms" className="text-primary hover:underline">服务条款</Link>
            {" "}和{" "}
            <Link href="/privacy" className="text-primary hover:underline">隐私政策</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
