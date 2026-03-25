import Link from "next/link";

export default function AdminReviewPage() {
  return (
    <section>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>管理审核</h1>
      <p style={{ marginTop: 12, color: "#475569" }}>
        审核队列页面已预留，后续可按书籍进入具体审核面板。
      </p>
      <Link href="/admin/review/demo-book" style={{ display: "inline-block", marginTop: 16, color: "#2563eb" }}>
        查看示例书籍审核页
      </Link>
    </section>
  );
}
