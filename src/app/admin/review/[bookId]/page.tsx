interface AdminBookReviewPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function AdminBookReviewPage({
  params
}: AdminBookReviewPageProps) {
  const { bookId } = await params;

  return (
    <section>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>书籍审核</h1>
      <p style={{ marginTop: 12, color: "#475569" }}>
        当前书籍 ID：
        {" "}
        <code>{bookId}</code>
      </p>
    </section>
  );
}
