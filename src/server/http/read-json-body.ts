/**
 * 功能：以类型安全方式读取 Route Handler 的 JSON 请求体。
 * 输入：`request: Request`（来自 Next.js Route Handler）。
 * 输出：`unknown`；当请求体为空或 JSON 非法时返回空对象 `{}`。
 * 异常：无（内部捕获解析异常并安全降级）。
 * 副作用：消费一次请求体流；同一个 `Request` 不能重复读取 body。
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const rawText = await request.text();
    if (!rawText.trim()) {
      return {};
    }

    return JSON.parse(rawText) as unknown;
  } catch {
    return {};
  }
}
