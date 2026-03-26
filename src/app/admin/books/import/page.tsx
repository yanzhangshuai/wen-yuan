"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { 
  UploadCloud, 
  FileText, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Loader2 
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"; // Assuming simple input exists
import { readApiErrorMessage, readApiSuccessResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

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

const MODELS = [
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", speed: "Fast", desc: "Balanced performance" },
  { id: "qwen-max", name: "通义千问 Max", provider: "Alibaba", speed: "Medium", desc: "Strong in ancient text" },
  { id: "doubao-pro", name: "豆包 Pro", provider: "ByteDance", speed: "Fast", desc: "Good context window" }
];

type AnalyzeScope = "FULL_BOOK" | "CHAPTER_RANGE";

type StartAnalysisBody =
  | {
    aiModelId: string;
    scope    : "FULL_BOOK";
  }
  | {
    aiModelId   : string;
    scope       : "CHAPTER_RANGE";
    chapterStart: number;
    chapterEnd  : number;
  };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseCreatedBookData(payload: unknown): CreatedBookData | null {
  const successResponse = readApiSuccessResponse(payload);
  if (successResponse === null) {
    return null;
  }

  const data = asRecord(successResponse.data);
  if (!data) {
    return null;
  }

  const id = data.id;
  const title = data.title;
  if (typeof id !== "string" || typeof title !== "string") {
    return null;
  }

  return { id, title };
}

function parseChapterPreviewItems(payload: unknown): ChapterPreviewItem[] | null {
  const successResponse = readApiSuccessResponse(payload);
  if (successResponse === null) {
    return null;
  }

  const data = asRecord(successResponse.data);
  if (!data) {
    return null;
  }

  const items = data.items;
  if (!Array.isArray(items)) {
    return null;
  }

  const normalizedItems = items
    .map((item): ChapterPreviewItem | null => {
      const row = asRecord(item);
      if (!row) {
        return null;
      }

      const index = row.index;
      const chapterType = row.chapterType;
      const title = row.title;
      const wordCount = row.wordCount;

      if (
        typeof index !== "number"
        || typeof chapterType !== "string"
        || typeof title !== "string"
        || typeof wordCount !== "number"
      ) {
        return null;
      }

      return {
        index,
        chapterType,
        title,
        wordCount
      };
    })
    .filter((item): item is ChapterPreviewItem => item !== null);

  return normalizedItems;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  return response.json().catch((): unknown => null);
}

function getApiErrorMessage(payload: unknown): string {
  return readApiErrorMessage(payload, "请求失败，请稍后重试");
}

function parseScope(value: string): AnalyzeScope {
  if (value === "CHAPTER_RANGE") {
    return "CHAPTER_RANGE";
  }

  return "FULL_BOOK";
}

function parsePositiveInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

export default function AdminImportPage() {
  const [step, setStep] = useState<ImportStep>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Form State
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [description, setDescription] = useState("");
  
  const [createdBook, setCreatedBook] = useState<CreatedBookData | null>(null);
  const [previewItems, setPreviewItems] = useState<ChapterPreviewItem[]>([]);
  
  // Config
  const [scope, setScope] = useState<AnalyzeScope>("FULL_BOOK");
  const [chapterStart, setChapterStart] = useState("");
  const [chapterEnd, setChapterEnd] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  
  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Handlers
  async function handleCreateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
        setErrorMessage("请先选择 .txt 文件");
        return;
    }
    setErrorMessage(""); setMessage(""); setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      if(title) formData.set("title", title);
      if(author) formData.set("author", author);
      if(dynasty) formData.set("dynasty", dynasty);
      if(description) formData.set("description", description);

      const response = await fetch("/api/books", { method: "POST", body: formData });
      const payload = await readJsonPayload(response);
      const data = parseCreatedBookData(payload);

      if (!response.ok || !data) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }

      setCreatedBook({ id: data.id, title: data.title });
      setStep(2); // Move to Chapter Preview Confirmation
      setMessage("书籍已创建，准备生成章节预览...");
      
      // Auto fetch preview?
      // handleLoadPreview(data.id); 
      // Better let user click "Next" or auto.
      // Let's manually trigger preview fetch for better UX control
    } catch {
      setErrorMessage("创建书籍失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoadPreview() {
    if (!createdBook) return;
    setErrorMessage(""); setMessage(""); setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(createdBook.id)}/chapters/preview`);
      const payload = await readJsonPayload(response);
      const items = parseChapterPreviewItems(payload);

      if (!response.ok || items === null) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }

      setPreviewItems(items);
      setStep(3); 
      setMessage("章节草稿已生成，请确认。");
    } catch {
      setErrorMessage("预览失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartAnalysis() {
    if (!createdBook) return;
    setErrorMessage(""); setMessage(""); setIsSubmitting(true);
    
    try {
      let body: StartAnalysisBody | null = null;

      if (scope === "CHAPTER_RANGE") {
        const parsedChapterStart = parsePositiveInteger(chapterStart);
        const parsedChapterEnd = parsePositiveInteger(chapterEnd);
        if (parsedChapterStart === null || parsedChapterEnd === null) {
          setErrorMessage("请输入合法的章节范围（正整数）");
          return;
        }

        body = {
          scope       : "CHAPTER_RANGE",
          aiModelId   : selectedModel,
          chapterStart: parsedChapterStart,
          chapterEnd  : parsedChapterEnd
        };
      } else {
        body = {
          scope    : "FULL_BOOK",
          aiModelId: selectedModel
        };
      }

      if (body === null) {
        return;
      }
      
      const response = await fetch(`/api/books/${encodeURIComponent(createdBook.id)}/analyze`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(body)
      });
      const payload = await readJsonPayload(response);
      
      if (!response.ok || readApiSuccessResponse(payload) === null) {
        setErrorMessage(getApiErrorMessage(payload));
        return;
      }
      
      setStep(4);
      setMessage("解析任务已启动！");
    } catch {
      setErrorMessage("启动失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold text-[var(--color-fg)]">导入书籍</h1>
           <p className="text-[var(--color-muted-fg)] mt-1">按照向导完成书籍导入与解析配置</p>
         </div>
         <Link href="/admin/books" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
           返回书库列表
         </Link>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center justify-between relative px-4">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex flex-col items-center z-10 relative">
             <div className={cn(
               "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 border-2",
               step >= s 
                 ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]" 
                 : "bg-[var(--color-bg)] text-[var(--color-muted-fg)] border-[var(--color-border)]"
             )}>
               {step > s ? <CheckCircle2 size={16} /> : s}
             </div>
             <span className="text-xs mt-2 font-medium text-[var(--color-muted-fg)]">
               {s === 1 ? "上传/元数据" : s === 2 ? "章节预览" : s === 3 ? "模型配置" : "完成"}
             </span>
          </div>
        ))}
        {/* Progress Bar Background */}
        <div className="absolute left-0 right-0 top-4 h-[2px] bg-[var(--color-border)] -z-0 mx-8" />
        {/* Progress Bar Active */}
        <div 
           className="absolute left-0 top-4 h-[2px] bg-[var(--color-primary)] -z-0 mx-8 transition-all duration-300" 
           style={{ width: `${((Math.min(step, 4) - 1) / 3) * 100}%` }}
        />
      </div>
      
      {/* Alerts */}
      {(errorMessage || message) && (
        <div className={cn(
          "p-4 rounded-md flex items-start gap-3",
          errorMessage ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]" : "bg-[var(--color-success)]/10 text-[var(--color-success)]"
        )}>
           {errorMessage ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
           <div>{errorMessage || message}</div>
        </div>
      )}

      {/* Steps Content */}
      <div className="space-y-6">
      
         {/* Step 1: Upload & Meta */}
         {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>书籍信息与上传</CardTitle>
                <CardDescription>支持 .txt 格式，建议 UTF-8 编码</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => { void handleCreateBook(event); }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="md:col-span-2 space-y-2">
                      <label className="text-sm font-medium">文件上传 *</label>
                      <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-[var(--color-primary)] transition-colors cursor-pointer bg-[var(--color-bg)]/50">
                         <input 
                           type="file" 
                           accept=".txt"
                           onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                           className="hidden" 
                           id="file-upload"
                         />
                         <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                            <UploadCloud className="w-10 h-10 text-[var(--color-muted-fg)] mb-2" />
                            <span className="text-sm font-medium text-[var(--color-fg)]">
                              {selectedFile ? selectedFile.name : "点击选择或拖拽文件"}
                            </span>
                            <span className="text-xs text-[var(--color-muted-fg)] mt-1">最大 50MB</span>
                         </label>
                      </div>
                   </div>
                   
                   <div className="space-y-2">
                      <label htmlFor="title" className="text-sm font-medium">书名</label>
                      <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="自动识别，可修改" />
                   </div>
                   <div className="space-y-2">
                       <label htmlFor="author" className="text-sm font-medium">作者</label>
                       <Input id="author" value={author} onChange={e => setAuthor(e.target.value)} placeholder="例如：曹雪芹" />
                   </div>

                   <div className="space-y-2">
                      <label htmlFor="dynasty" className="text-sm font-medium">朝代</label>
                      <Input id="dynasty" value={dynasty} onChange={e => setDynasty(e.target.value)} placeholder="例如：清代" />
                   </div>

                   <div className="space-y-2">
                      <label htmlFor="description" className="text-sm font-medium">简介</label>
                      <Input id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="可选，最多 5000 字" />
                   </div>
                   
                   <div className="md:col-span-2 flex justify-end">
                      <Button type="submit" disabled={isSubmitting}>
                         {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                         下一步：生成章节预览
                      </Button>
                   </div>
                </form>
              </CardContent>
            </Card>
         )}

         {/* Step 2: Confirmation & Chapter Preview Trigger */}
         {/* Note: Logic jumped to step 3 in handleCreateBook? Let's fix state logic. 
             If handleCreateBook successful, we have createdBook. 
             We should show "Preview" button or Auto load.
             Let's use step 2 as "Ready to Preview" state.
         */}
         {step === 2 && (
             <Card>
               <CardHeader>
                 <CardTitle>章节预览</CardTitle>
                 <CardDescription>系统将自动识别目录结构，请检查是否正确。</CardDescription>
               </CardHeader>
               <CardContent className="flex flex-col items-center py-8">
                  <FileText className="w-16 h-16 text-[var(--color-primary)] mb-4" />
                  <h3 className="text-lg font-bold mb-2">《{createdBook?.title}》已创建</h3>
                  <p className="text-[var(--color-muted-fg)] mb-6 text-center max-w-md">
                    点击下方按钮生成章节预览。AI 将自动识别“第X回”等格式。
                  </p>
                  <Button onClick={() => { void handleLoadPreview(); }} disabled={isSubmitting}>
                     {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     生成并检查章节
                  </Button>
               </CardContent>
             </Card>
         )}

         {/* Step 3: Chapter List & Model Config */}
         {step === 3 && (
            <div className="space-y-6">
               <Card>
                 <CardHeader>
                    <CardTitle>章节列表确认</CardTitle>
                    <CardDescription>共识别到 {previewItems.length} 个章节</CardDescription>
                 </CardHeader>
                 <CardContent>
                    <div className="max-h-[300px] overflow-y-auto border rounded-md">
                       <table className="w-full text-sm">
                          <thead className="bg-[var(--color-muted)]/10 sticky top-0 backdrop-blur">
                             <tr>
                               <th className="px-4 py-2 text-left">序</th>
                               <th className="px-4 py-2 text-left">标题</th>
                               <th className="px-4 py-2 text-right">字数</th>
                             </tr>
                          </thead>
                          <tbody>
                             {previewItems.map((item, idx) => (
                               <tr key={idx} className="border-t border-[var(--color-border)]">
                                  <td className="px-4 py-2">{item.index}</td>
                                  <td className="px-4 py-2 font-medium">{item.title}</td>
                                  <td className="px-4 py-2 text-right opacity-70">{item.wordCount}</td>
                               </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardHeader>
                    <CardTitle>解析配置</CardTitle>
                    <CardDescription>选择 AI 模型与解析范围</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-6">
                    {/* Model Selection Cards */}
                    <div>
                       <label className="text-sm font-medium mb-3 block">选择模型</label>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {MODELS.map(model => (
                             <div 
                               key={model.id}
                               onClick={() => setSelectedModel(model.id)}
                               className={cn(
                                 "cursor-pointer border-2 rounded-lg p-4 transition-all hover:bg-[var(--color-primary-subtle)]/10",
                                 selectedModel === model.id 
                                   ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/20" 
                                   : "border-[var(--color-border)]"
                               )}
                             >
                                <div className="font-bold text-sm mb-1">{model.name}</div>
                                <div className="text-xs text-[var(--color-muted-fg)] mb-2">{model.provider}</div>
                                <div className="flex items-center justify-between mt-2">
                                   <Badge variant="outline" className="text-[10px] h-5">{model.speed}</Badge>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="text-sm font-medium mb-1 block">解析范围</label>
                          <select 
                            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm"
                            value={scope}
                            onChange={(event) => setScope(parseScope(event.target.value))}
                          >
                             <option value="FULL_BOOK">全书解析</option>
                             <option value="CHAPTER_RANGE">指定章节范围</option>
                          </select>
                       </div>
                       {scope === "CHAPTER_RANGE" && (
                          <div className="flex items-center gap-2">
                             <div className="flex-1">
                                <label className="text-sm font-medium mb-1 block">起始</label>
                                <Input type="number" value={chapterStart} onChange={e => setChapterStart(e.target.value)} />
                             </div>
                             <div className="flex-1">
                                <label className="text-sm font-medium mb-1 block">结束</label>
                                <Input type="number" value={chapterEnd} onChange={e => setChapterEnd(e.target.value)} />
                             </div>
                          </div>
                       )}
                    </div>
                 </CardContent>
               </Card>
               
               <div className="flex justify-end pt-4">
                  <Button size="lg" onClick={() => { void handleStartAnalysis(); }} disabled={isSubmitting}>
                     {isSubmitting ? "启动中..." : "启动解析任务"}
                     <Play className="ml-2 w-4 h-4" />
                  </Button>
               </div>
            </div>
         )}
         
         {/* Step 4: Success */}
         {step === 4 && (
            <Card className="border-[var(--color-success)]/50 bg-[var(--color-success)]/5">
               <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-[var(--color-success)] text-white flex items-center justify-center mb-6 shadow-lg animate-bounce">
                     <CheckCircle2 size={40} />
                  </div>
                  <h2 className="text-2xl font-bold text-[var(--color-success)] mb-2">解析任务已启动</h2>
                  <p className="text-[var(--color-muted-fg)] max-w-md mb-8">
                    后台正在进行文本清洗与实体提取，请耐心等待。您可以随时回来查看进度。
                  </p>
                  <div className="flex gap-4">
                     <Link href="/admin/books">
                        <Button variant="outline">返回书库列表</Button>
                     </Link>
                     <Link href={`/admin/books/${createdBook?.id}`}>
                        <Button>查看书籍详情</Button>
                     </Link>
                  </div>
               </CardContent>
            </Card>
         )}

      </div>
    </div>
  );
}
