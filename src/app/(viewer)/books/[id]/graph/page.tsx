interface BookGraphPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookGraphPage({
  params
}: BookGraphPageProps) {
  const { id } = await params;

  return (
    <section className="book-graph-page rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h1 className="text-2xl font-semibold">人物图谱（开发中）</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        当前书籍 ID：
        {" "}
        <code>{id}</code>
      </p>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        下一步将接入图谱数据与可视化渲染。
      </p>
    </section>
  );
}
