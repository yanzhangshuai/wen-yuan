import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";

const hoisted = vi.hoisted(() => ({
  getBookByIdMock: vi.fn()
}));

vi.mock("@/server/modules/books/getBookById", () => ({
  getBookById: hoisted.getBookByIdMock
}));

function findElementByProp(
  node: ReactNode,
  propName: string,
  propValue: unknown
): ReactElement<Record<string, unknown>> | null {
  const nodes = Children.toArray(node);

  for (const current of nodes) {
    if (!isValidElement<Record<string, unknown>>(current)) {
      continue;
    }

    if (current.props[propName] === propValue) {
      return current;
    }

    const childResult = findElementByProp(current.props.children as ReactNode, propName, propValue);
    if (childResult) {
      return childResult;
    }
  }

  return null;
}

/**
 * 文件定位（旧 review-center 迁移页测试）：
 * - 锁定 T20 对旧审核中心页面的退役方式：保留 URL，但不再渲染旧 tabs。
 * - 页面应显式把操作员引导到新的人物、关系、时间审核入口。
 */
describe("ReviewCenterPage", () => {
  beforeEach(() => {
    hoisted.getBookByIdMock.mockResolvedValue({
      id   : BOOK_ID,
      title: "儒林外史"
    });
  });

  afterEach(() => {
    hoisted.getBookByIdMock.mockReset();
    vi.resetModules();
  });

  it("renders migration links into the new review surfaces", async () => {
    const { default: ReviewCenterPage } = await import("./page");

    const page = await ReviewCenterPage({
      params: Promise.resolve({ id: BOOK_ID })
    });

    expect(findElementByProp(page, "href", `/admin/review/${BOOK_ID}`)).not.toBeNull();
    expect(findElementByProp(page, "href", `/admin/review/${BOOK_ID}/relations`)).not.toBeNull();
    expect(findElementByProp(page, "href", `/admin/review/${BOOK_ID}/time`)).not.toBeNull();
  });
});
