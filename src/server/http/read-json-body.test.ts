import { describe, expect, it, vi } from "vitest";

import { readJsonBody } from "@/server/http/read-json-body";

describe("readJsonBody", () => {
  it("parses a valid JSON object body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : JSON.stringify({ title: "儒林外史", chapter: 1 })
    });

    await expect(readJsonBody(request)).resolves.toEqual({
      title  : "儒林外史",
      chapter: 1
    });
  });

  it("parses a valid JSON array body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : JSON.stringify(["a", "b", "c"])
    });

    await expect(readJsonBody(request)).resolves.toEqual(["a", "b", "c"]);
  });

  it("parses valid JSON primitive body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : "123"
    });

    await expect(readJsonBody(request)).resolves.toBe(123);
  });

  it("returns empty object when body is empty", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : ""
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  it("returns empty object when body is whitespace only", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : "   \n\t   "
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  it("returns empty object when JSON is invalid", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : "{invalid-json"
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  it("returns empty object when request body is already consumed", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : JSON.stringify({ once: true })
    });

    await expect(readJsonBody(request)).resolves.toEqual({ once: true });
    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  it("returns empty object when request.text throws", async () => {
    const fakeRequest = {
      text: vi.fn().mockRejectedValue(new Error("read failed"))
    } as unknown as Request;

    await expect(readJsonBody(fakeRequest)).resolves.toEqual({});
  });
});
