import { Network, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { FormDescription, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

/**
 * 首页暂时作为后台 UI 基础能力的演示页。
 * 在 PRD 对齐完成前，这里集中展示可复用组件，方便后续替换成真实业务页面。
 */
interface HomePageProps {}

export default function HomePage({}: HomePageProps) {
  return (
    <main className="home-page mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <section className="home-page-hero grid gap-6 rounded-[2rem] border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-8 shadow-sm md:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-5">
          <Badge variant="outline" className="w-fit gap-2 px-3 py-1">
            <Sparkles className="size-3.5" />
            UI Foundation Ready
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              文渊 UI 基础组件库已接入
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
              当前项目已建立 `src/components/ui` 基础层，可直接复用于登录页、管理员后台、模型设置页和导入流程。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button>开始搭建后台</Button>
            <Button variant="outline">查看组件目录</Button>
            <Button variant="ghost">继续定制视觉</Button>
          </div>
        </div>

        <Card className="book-foundation-card overflow-hidden">
          <CardHeader>
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-full bg-[var(--primary)] p-3 text-[var(--primary-foreground)]">
                <Network className="size-5" />
              </div>
              <div>
                <CardTitle>组件基础层</CardTitle>
                <CardDescription>围绕中后台和内容录入场景搭建</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Badge>Button</Badge>
              <Badge>Select</Badge>
              <Badge>Dialog</Badge>
              <Badge>Table</Badge>
              <Badge>Form</Badge>
              <Badge>Alert</Badge>
            </div>
            <Alert variant="success">
              <AlertTitle>组件目录已就绪</AlertTitle>
              <AlertDescription>
                后续页面可以先拼业务，不必重复造按钮、表单和表格。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </section>

      <section className="home-page-grid grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>模型设置表单预览</CardTitle>
            <CardDescription>
              这一组基础输入组件可直接服务 `/admin/model` 页面。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormItem>
              <FormLabel htmlFor="provider">模型提供商</FormLabel>
              <Select id="provider" defaultValue="deepseek">
                <option value="deepseek">DeepSeek</option>
                <option value="qwen">通义千问</option>
                <option value="doubao">豆包</option>
                <option value="gemini">Gemini</option>
              </Select>
              <FormDescription>可先用原生 select，后续再升级交互。</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel htmlFor="api-key">API Key</FormLabel>
              <Input id="api-key" placeholder="sk-******" />
            </FormItem>
            <FormItem>
              <FormLabel htmlFor="base-url">Base URL</FormLabel>
              <Input id="base-url" placeholder="https://api.deepseek.com" />
            </FormItem>
            <FormItem>
              <FormLabel htmlFor="notes">配置备注</FormLabel>
              <Textarea
                id="notes"
                placeholder="记录模型用途、限流注意事项或私有部署说明"
              />
            </FormItem>
          </CardContent>
          <CardFooter>
            <Button>保存模型配置</Button>
            <Button variant="outline">测试连通性</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>后台表格与反馈预览</CardTitle>
            <CardDescription>管理审核页和导入流程都可以复用这套骨架。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>组件</TableHead>
                  <TableHead>用途</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Button</TableCell>
                  <TableCell>触发保存、登录、审核动作</TableCell>
                  <TableCell>
                    <Badge variant="success">已接入</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Table</TableCell>
                  <TableCell>管理审核列表、模型清单</TableCell>
                  <TableCell>
                    <Badge variant="success">已接入</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Skeleton</TableCell>
                  <TableCell>后台首屏与列表加载骨架</TableCell>
                  <TableCell>
                    <Badge variant="warning">可用</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>

            <Alert>
              <AlertTitle>下一步建议</AlertTitle>
              <AlertDescription>
                优先用这套基础组件搭建 `/login`、`/admin/layout`、`/admin/model`，再补更复杂的交互组件。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
