/**
 * =============================================================================
 * 文件定位（Route Handler 请求体读取工具）
 * -----------------------------------------------------------------------------
 * 本文件用于在 Next.js Route Handler 中读取 JSON 请求体并做安全降级。
 *
 * 为什么需要它：
 * - `request.json()` 在空 body 或非法 JSON 时会抛异常；
 * - 业务上我们希望“解析失败 -> 返回 schema 校验错误”，而不是直接 500；
 * - 因此统一返回 `unknown`，交由 zod 等上层做结构校验。
 *
 * 重要框架语义：
 * - Request body 是可消费流，只能读取一次；
 * - 调用本函数后，route 中不应再次读取 `request.text()/json()`。
 * =============================================================================
 *
 * 功能：以类型安全方式读取 Route Handler 的 JSON 请求体。
 * 输入：`request: Request`（来自 Next.js Route Handler）。
 * 输出：`unknown`；当请求体为空或 JSON 非法时返回空对象 `{}`。
 * 异常：无（内部捕获解析异常并安全降级）。
 * 副作用：消费一次请求体流；同一个 `Request` 不能重复读取 body。
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    // 先读取原始文本，再自行判断空字符串，避免 request.json() 在空 body 时抛错。
    const rawText = await request.text();
    if (!rawText.trim()) {
      // 业务意图：空请求体按“空对象”处理，后续由 schema 决定哪些字段是必填。
      return {};
    }

    return JSON.parse(rawText) as unknown;
  } catch {
    // 防御策略：JSON 非法时不抛异常，统一回落到 {}，让上层返回可控 400。
    return {};
  }
}
