import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, BioCategory, ProcessingStatus } from "@/generated/prisma/enums";

const updateBiographyRecordMock = vi.fn();
const deleteBiographyRecordMock = vi.fn();

vi.mock("@/server/modules/biography/updateBiographyRecord", () => ({
  updateBiographyRecord: updateBiographyRecordMock
}));

vi.mock("@/server/modules/biography/deleteBiographyRecord", () => ({
  deleteBiographyRecord: deleteBiographyRecordMock
}));

vi.mock("@/server/modules/biography/errors", () => {
  class BiographyRecordNotFoundError extends Error {
    readonly biographyId: string;

    constructor(biographyId: string) {
      super(`Biography record not found: ${biographyId}`);
      this.biographyId = biographyId;
    }
  }

  class BiographyInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    BiographyRecordNotFoundError,
    BiographyInputError
  };
});

describe("PATCH /api/biography/:id", () => {
  afterEach(() => {
    updateBiographyRecordMock.mockReset();
    deleteBiographyRecordMock.mockReset();
  });

  it("updates biography record when admin requests", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    const chapterId = "f3cb9867-f921-4e3f-b2dd-f4f77722579d";
    updateBiographyRecordMock.mockResolvedValue({
      id         : biographyId,
      personaId  : "persona-1",
      chapterId,
      chapterNo  : 2,
      category   : BioCategory.EVENT,
      title      : "中举",
      location   : "会稽",
      event      : "周进中举",
      virtualYear: null,
      status     : ProcessingStatus.VERIFIED,
      updatedAt  : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("BIOGRAPHY_UPDATED");
    expect(updateBiographyRecordMock).toHaveBeenCalledWith(biographyId, {
      chapterId,
      event: "周进中举"
    });
  });

  it("returns 403 when viewer requests", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(403);
    expect(updateBiographyRecordMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(400);
    expect(updateBiographyRecordMock).not.toHaveBeenCalled();
  });

  it("returns 404 when record missing", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    const { BiographyRecordNotFoundError } = await import("@/server/modules/biography/errors");
    updateBiographyRecordMock.mockRejectedValue(new BiographyRecordNotFoundError(biographyId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

describe("DELETE /api/biography/:id", () => {
  afterEach(() => {
    updateBiographyRecordMock.mockReset();
    deleteBiographyRecordMock.mockReset();
  });

  it("soft deletes biography record when admin requests", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    deleteBiographyRecordMock.mockResolvedValue({
      id       : biographyId,
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("BIOGRAPHY_DELETED");
    expect(deleteBiographyRecordMock).toHaveBeenCalledWith(biographyId);
  });

  it("returns 403 when viewer requests", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.VIEWER
      }
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(403);
    expect(deleteBiographyRecordMock).not.toHaveBeenCalled();
  });

  it("returns 404 when record missing", async () => {
    const biographyId = "7307b85f-2df3-40d5-af4d-6e495a8d319f";
    const { BiographyRecordNotFoundError } = await import("@/server/modules/biography/errors");
    deleteBiographyRecordMock.mockRejectedValue(new BiographyRecordNotFoundError(biographyId));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/biography/${biographyId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: biographyId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
