import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/types/api";

import {
  AuthError,
  readAuthContext,
  requireAnyRole,
  requireProjectScope,
  requireWorkScope,
  type RequestAuthContext
} from "./rbac";

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com", { headers: new Headers(headers) });
}

const reviewerAuth: RequestAuthContext = {
  userId: "u-1",
  roles: ["reviewer"],
  tenantId: "t-1",
  projectIds: ["p-1"],
  workIds: ["w-1"]
};

describe("readAuthContext", () => {
  it("returns dev admin context in non-production when auth headers are missing", () => {
    const auth = readAuthContext(createRequest());

    expect(auth.userId).toBe("dev-admin");
    expect(auth.roles).toEqual(["admin"]);
    expect(auth.tenantId).toBe("dev-tenant");
  });

  it("parses auth headers into context", () => {
    const auth = readAuthContext(
      createRequest({
        "x-user-id": "user-123",
        "x-user-roles": "reviewer,annotator",
        "x-tenant-id": "tenant-1",
        "x-project-ids": "p-1, p-2",
        "x-work-ids": "w-1, w-2"
      })
    );

    expect(auth).toEqual({
      userId: "user-123",
      roles: ["reviewer", "annotator"],
      tenantId: "tenant-1",
      projectIds: ["p-1", "p-2"],
      workIds: ["w-1", "w-2"]
    });
  });

  it("throws unauthorized when key headers are missing", () => {
    expect(() =>
      readAuthContext(
        createRequest({
          "x-user-id": "user-123"
        })
      )
    ).toThrowError(AuthError);

    try {
      readAuthContext(
        createRequest({
          "x-user-id": "user-123"
        })
      );
    } catch (error) {
      const authError = error as AuthError;
      expect(authError.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
      expect(authError.message).toContain("缺少认证信息");
    }
  });

  it("throws unauthorized when role list is effectively empty", () => {
    expect(() =>
      readAuthContext(
        createRequest({
          "x-user-id": "user-123",
          "x-user-roles": " , "
        })
      )
    ).toThrowError(AuthError);
  });
});

describe("scope and role guards", () => {
  it("allows admin for any role checks", () => {
    expect(() =>
      requireAnyRole(
        {
          ...reviewerAuth,
          roles: ["admin"]
        },
        ["viewer"]
      )
    ).not.toThrow();
  });

  it("throws forbidden when role is not in allowed list", () => {
    expect(() => requireAnyRole(reviewerAuth, ["annotator"])).toThrowError(AuthError);
  });

  it("validates project scope", () => {
    expect(() => requireProjectScope(reviewerAuth, "p-1")).not.toThrow();
    expect(() => requireProjectScope(reviewerAuth, "")).toThrowError(AuthError);
    expect(() => requireProjectScope(reviewerAuth, "p-2")).toThrowError(AuthError);
  });

  it("validates work scope", () => {
    expect(() => requireWorkScope(reviewerAuth, "w-1")).not.toThrow();
    expect(() => requireWorkScope(reviewerAuth, "")).toThrowError(AuthError);
    expect(() => requireWorkScope(reviewerAuth, "w-2")).toThrowError(AuthError);
  });
});
