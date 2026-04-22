import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ reportError: vi.fn() }));

import {
  success,
  successWithPagination,
  created,
  errors,
} from "./api-response";

describe("success", () => {
  it("should create success response with data", async () => {
    const response = success({ id: "123", name: "Test" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: { id: "123", name: "Test" },
    });
  });

  it("should allow custom status code", async () => {
    const response = success({ message: "OK" }, 202);
    expect(response.status).toBe(202);
  });
});

describe("successWithPagination", () => {
  it("should include pagination metadata", async () => {
    const response = successWithPagination(
      [{ id: "1" }, { id: "2" }],
      { page: 1, pageSize: 10, total: 25 }
    );
    const json = await response.json();

    expect(json).toEqual({
      ok: true,
      data: [{ id: "1" }, { id: "2" }],
      meta: {
        page: 1,
        pageSize: 10,
        total: 25,
        hasMore: true,
      },
    });
  });

  it("should set hasMore to false on last page", async () => {
    const response = successWithPagination(
      [{ id: "1" }],
      { page: 3, pageSize: 10, total: 25 }
    );
    const json = await response.json();

    expect(json.meta.hasMore).toBe(false);
  });
});

describe("created", () => {
  it("should return 201 status", async () => {
    const response = created({ id: "new-123" });
    expect(response.status).toBe(201);
  });
});

describe("errors", () => {
  it("badRequest should return 400", async () => {
    const response = errors.badRequest("Invalid input");
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: "Invalid input",
        details: undefined,
      },
    });
  });

  it("unauthorized should return 401", async () => {
    const response = errors.unauthorized();
    expect(response.status).toBe(401);
  });

  it("forbidden should return 403", async () => {
    const response = errors.forbidden();
    expect(response.status).toBe(403);
  });

  it("notFound should return 404 with resource name", async () => {
    const response = errors.notFound("Project");
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.message).toBe("Project not found");
  });

  it("validationError should format Zod issues", async () => {
    const response = errors.validationError([
      { path: ["email"], message: "Invalid email", code: "custom" },
      { path: ["password"], message: "Too short", code: "custom" }
    ]);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.details).toEqual([
      { field: "email", message: "Invalid email" },
      { field: "password", message: "Too short" },
    ]);
  });

  it("rateLimited should return 429 with Retry-After header", async () => {
    const response = errors.rateLimited(60);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("serverError should return 500", async () => {
    const response = errors.serverError();
    expect(response.status).toBe(500);
  });
});
