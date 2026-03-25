"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CreatedBookData {
  id   : string;
  title: string;
}

interface ChapterPreviewItem {
  index      : number;
  chapterType: string;
  title      : string;
  wordCount  : number;
}

type ImportStep = 1 | 2 | 3 | 4;

function getApiErrorMessage(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "请求失败，请稍后重试";
  }

  const errorValue = Reflect.get(payload, "error");
  if (typeof errorValue === "object" && errorValue !== null) {
    const detail = Reflect.get(errorValue, "detail");
    if (typeof detail === "string" && detail) {
      return detail;
    }
  }

  const messageValue = Reflect.get(payload, "message");
  return typeof messageValue === "string" && messageValue ? messageValue : "请求失败，请稍后重试";
}

export default function ImportBookPage() {
  const [step, setStep] = useState<ImportStep>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [description, setDescription] = useState("");
  const [createdBook, setCreatedBook] = useState<CreatedBookData | null>(null);
  const [previewItems, setPreviewItems] = useState<ChapterPreviewItem[]>([]);
  const [scope, setScope] = useState<"FULL_BOOK" | "CHAPTER_RANGE">("FULL_BOOK");
  const [chapterStart, setChapterStart] = useState("");
  const [chapterEnd, setChapterEnd] = useState("");
  const [modelId, setModelId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCreateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setErrorMessage("请先选择 .txt 文件");
      return;
    }

    setErrorMessage("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("title", title);
      formData.set("author", author);
      formData.set("dynasty", dynasty);
      formData.set("description", description);

      const response = await fetch("/api/books", {
        method: "POST",
        body  : formData
      });
      const payload = await response.json();

      if (!response.ok || payload.success !== true) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }

      const data = payload.data as CreatedBookData;
      setCreatedBook({
        id   : data.id,
        title: data.title
      });
      setStep(2);
      setMessage("书籍已创建，可继续章节预览。");
    } catch {
      setErrorMessage("创建书籍失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoadPreview() {
    if (!createdBook) {
      return;
    }

    setErrorMessage("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/books/${encodeURIComponent(createdBook.id)}/chapters/preview`);
      const payload = await response.json();

      if (!response.ok || payload.success !== true) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }

      setPreviewItems(payload.data.items as ChapterPreviewItem[]);
      setStep(3);
      setMessage("章节草稿已生成，可确认后启动解析。");
    } catch {
      setErrorMessage("获取章节预览失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartAnalysis() {
    if (!createdBook) {
      return;
    }

    setErrorMessage("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        scope
      };

      if (modelId.trim()) {
        body.aiModelId = modelId.trim();
      }

      if (scope === "CHAPTER_RANGE") {
        body.chapterStart = Number(chapterStart);
        body.chapterEnd = Number(chapterEnd);
      }

      const response = await fetch(`/api/books/${encodeURIComponent(createdBook.id)}/analyze`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = await response.json();

      if (!response.ok || payload.success !== true) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }

      setStep(4);
      setMessage("解析任务已启动，返回书库可查看进度。");
    } catch {
      setErrorMessage("启动解析失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Import Wizard</p>
          <h1 className="text-3xl font-semibold tracking-tight">导入书籍</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            当前 MVP 流程：`.txt` 导入 → 元数据确认 → 章节切分预览 → 启动解析。
          </p>
        </div>
        <Link href="/" className="text-sm text-[var(--primary)] underline underline-offset-4">
          返回书库
        </Link>
      </header>

      <section className="flex flex-wrap gap-2">
        <Badge variant={step >= 1 ? "success" : "outline"}>1 上传</Badge>
        <Badge variant={step >= 2 ? "success" : "outline"}>2 元数据</Badge>
        <Badge variant={step >= 3 ? "success" : "outline"}>3 章节预览</Badge>
        <Badge variant={step >= 4 ? "success" : "outline"}>4 启动解析</Badge>
      </section>

      {message ? <p className="rounded-lg border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="rounded-lg border border-red-300/50 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Step 1-2：上传文件与元数据确认</CardTitle>
          <CardDescription>先创建书籍记录，后续步骤都基于该记录继续。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateBook}>
            <FormItem className="md:col-span-2">
              <FormLabel htmlFor="book-file">书籍文件（仅 .txt）</FormLabel>
              <Input
                id="book-file"
                name="book-file"
                type="file"
                accept=".txt,text/plain"
                disabled={isSubmitting}
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                required
              />
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="title">书名（可选）</FormLabel>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSubmitting}
                placeholder="可留空，系统会回退文件名"
              />
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="author">作者</FormLabel>
              <Input
                id="author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                disabled={isSubmitting}
                placeholder="例如：吴敬梓"
              />
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="dynasty">朝代</FormLabel>
              <Input
                id="dynasty"
                value={dynasty}
                onChange={(event) => setDynasty(event.target.value)}
                disabled={isSubmitting}
                placeholder="例如：清"
              />
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="description">简介</FormLabel>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSubmitting}
                placeholder="可选，最多 5000 字"
              />
            </FormItem>

            <div className="md:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "提交中..." : "创建书籍"}
              </Button>
              {createdBook ? <p className="text-sm text-[var(--muted-foreground)]">当前书籍：{createdBook.title}（{createdBook.id}）</p> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3：章节切分预览</CardTitle>
          <CardDescription>可先自动预览，再进入后续人工调整（后续迭代完善）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleLoadPreview} disabled={!createdBook || isSubmitting}>
            生成章节预览
          </Button>

          {previewItems.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2">序号</th>
                    <th className="px-3 py-2">章节类型</th>
                    <th className="px-3 py-2">标题</th>
                    <th className="px-3 py-2">字数</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((item) => (
                    <tr key={`${item.index}-${item.title}`} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">{item.index}</td>
                      <td className="px-3 py-2">{item.chapterType}</td>
                      <td className="px-3 py-2">{item.title}</td>
                      <td className="px-3 py-2">{item.wordCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">尚未生成章节预览。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 4：启动解析任务</CardTitle>
          <CardDescription>支持全书解析或章节范围重解析（MVP v1.1）。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FormItem>
            <FormLabel htmlFor="model-id">模型 ID（可选）</FormLabel>
            <Input
              id="model-id"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              disabled={isSubmitting}
              placeholder="可留空，默认使用书籍当前模型"
            />
          </FormItem>

          <FormItem>
            <FormLabel htmlFor="scope">解析范围</FormLabel>
            <select
              id="scope"
              value={scope}
              disabled={isSubmitting}
              onChange={(event) => setScope(event.target.value as "FULL_BOOK" | "CHAPTER_RANGE")}
              className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            >
              <option value="FULL_BOOK">全书</option>
              <option value="CHAPTER_RANGE">章节范围</option>
            </select>
          </FormItem>

          {scope === "CHAPTER_RANGE" ? (
            <>
              <FormItem>
                <FormLabel htmlFor="chapter-start">起始章节</FormLabel>
                <Input
                  id="chapter-start"
                  value={chapterStart}
                  onChange={(event) => setChapterStart(event.target.value)}
                  type="number"
                  min={1}
                  placeholder="例如 1"
                />
              </FormItem>
              <FormItem>
                <FormLabel htmlFor="chapter-end">结束章节</FormLabel>
                <Input
                  id="chapter-end"
                  value={chapterEnd}
                  onChange={(event) => setChapterEnd(event.target.value)}
                  type="number"
                  min={1}
                  placeholder="例如 20"
                />
              </FormItem>
            </>
          ) : null}

          <div className="md:col-span-2 flex items-center gap-3">
            <Button onClick={handleStartAnalysis} disabled={!createdBook || isSubmitting}>
              {isSubmitting ? "提交中..." : "启动解析"}
            </Button>
            {step >= 4 ? (
              <Link href="/" className="text-sm text-[var(--primary)] underline underline-offset-4">
                返回书库查看进度
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

