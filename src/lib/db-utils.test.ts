import { describe, it, expect } from "vitest";
import {
  parsePagination,
  paginationMeta,
  buildMultiFieldSearch,
  buildDateRangeFilter,
  buildNumberRangeFilter,
  chunk,
} from "./db-utils";

describe("parsePagination", () => {
  it("should return default pagination", () => {
    const result = parsePagination({});
    expect(result).toEqual({
      skip: 0,
      take: 20,
      page: 1,
      pageSize: 20,
    });
  });

  it("should calculate skip correctly", () => {
    const result = parsePagination({ page: 3, pageSize: 10 });
    expect(result.skip).toBe(20);
    expect(result.take).toBe(10);
  });

  it("should respect maxPageSize", () => {
    const result = parsePagination({ pageSize: 200 }, { maxPageSize: 50 });
    expect(result.pageSize).toBe(50);
  });

  it("should handle negative page", () => {
    const result = parsePagination({ page: -5 });
    expect(result.page).toBe(1);
  });
});

describe("paginationMeta", () => {
  it("should calculate correct metadata", () => {
    const pagination = parsePagination({ page: 2, pageSize: 10 });
    const meta = paginationMeta(45, pagination);

    expect(meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 45,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("should handle last page", () => {
    const pagination = parsePagination({ page: 5, pageSize: 10 });
    const meta = paginationMeta(45, pagination);

    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(true);
  });

  it("should handle first page", () => {
    const pagination = parsePagination({ page: 1, pageSize: 10 });
    const meta = paginationMeta(45, pagination);

    expect(meta.hasNext).toBe(true);
    expect(meta.hasPrev).toBe(false);
  });
});

describe("buildMultiFieldSearch", () => {
  it("should return undefined for empty query", () => {
    expect(buildMultiFieldSearch("", ["name", "email"])).toBeUndefined();
    expect(buildMultiFieldSearch(null, ["name"])).toBeUndefined();
    expect(buildMultiFieldSearch("   ", ["name"])).toBeUndefined();
  });

  it("should build OR conditions for each field", () => {
    const result = buildMultiFieldSearch("test", ["name", "email"]);
    expect(result).toEqual([
      { name: { contains: "test", mode: "insensitive" } },
      { email: { contains: "test", mode: "insensitive" } },
    ]);
  });
});

describe("buildDateRangeFilter", () => {
  it("should return undefined for empty range", () => {
    expect(buildDateRangeFilter()).toBeUndefined();
    expect(buildDateRangeFilter(null, null)).toBeUndefined();
  });

  it("should build gte filter for from date", () => {
    const result = buildDateRangeFilter("2024-01-01", null);
    expect(result?.gte).toEqual(new Date("2024-01-01"));
    expect(result?.lte).toBeUndefined();
  });

  it("should build both filters for range", () => {
    const result = buildDateRangeFilter("2024-01-01", "2024-12-31");
    expect(result?.gte).toEqual(new Date("2024-01-01"));
    expect(result?.lte).toEqual(new Date("2024-12-31"));
  });
});

describe("buildNumberRangeFilter", () => {
  it("should return undefined for empty range", () => {
    expect(buildNumberRangeFilter()).toBeUndefined();
    expect(buildNumberRangeFilter(null, null)).toBeUndefined();
  });

  it("should build min filter only", () => {
    const result = buildNumberRangeFilter(100, null);
    expect(result).toEqual({ gte: 100 });
  });

  it("should build max filter only", () => {
    const result = buildNumberRangeFilter(null, 500);
    expect(result).toEqual({ lte: 500 });
  });

  it("should build range filter", () => {
    const result = buildNumberRangeFilter(100, 500);
    expect(result).toEqual({ gte: 100, lte: 500 });
  });

  it("should handle zero values", () => {
    const result = buildNumberRangeFilter(0, 100);
    expect(result).toEqual({ gte: 0, lte: 100 });
  });
});

describe("chunk", () => {
  it("should chunk array into smaller arrays", () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("should handle empty array", () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it("should handle array smaller than chunk size", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});
