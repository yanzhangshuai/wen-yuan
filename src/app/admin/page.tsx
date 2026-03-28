import Link from "next/link";
import { Library, ClipboardCheck, Settings2 } from "lucide-react";

const NAV_CARDS = [
  {
    title      : "书库管理",
    description: "管理书籍导入、查看解析状态、删除或重新解析。",
    href       : "/admin/books",
    icon       : Library
  },
  {
    title      : "审核中心",
    description: "审核 AI 识别的人物、关系和传记，批量确认或拒绝。",
    href       : "/admin/review",
    icon       : ClipboardCheck
  },
  {
    title      : "模型设置",
    description: "配置 AI 模型 API Key、测试连通性、设置默认模型。",
    href       : "/admin/model",
    icon       : Settings2
  }
] as const;

export default function AdminHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">管理中心</h1>
        <p className="text-muted-foreground mt-2">
          欢迎回来，请选择一个模块开始工作。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {NAV_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block rounded-lg border border-border bg-white p-6 transition-all hover:shadow-lg hover:border-primary hover:-translate-y-1"
          >
            <div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <card.icon size={20} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
              {card.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
