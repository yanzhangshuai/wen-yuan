import { Network } from "lucide-react";

interface HomePageProps {}

export default function HomePage({}: HomePageProps) {
  return (
    <main className="home-page mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 rounded-full bg-slate-900 p-4 text-white">
        <Network className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        儒林外史人物关系图谱
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        项目已完成初始化：Next.js App Router、Prisma(PostgreSQL) 与 Neo4j 已就绪。
      </p>
    </main>
  );
}
