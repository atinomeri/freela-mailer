import { describe, it, expect } from "vitest";
import { cn, formatCurrency, truncate } from "./utils";

describe("cn (className merge)", () => {
  it("should merge class names", () => {
    const result = cn("px-4", "py-2");
    expect(result).toBe("px-4 py-2");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    const result = cn("base", isActive && "active");
    expect(result).toBe("base active");
  });

  it("should handle false/undefined classes", () => {
    const result = cn("base", false, undefined, null, "end");
    expect(result).toBe("base end");
  });

  it("should merge tailwind classes correctly", () => {
    const result = cn("px-4 py-2", "px-6");
    expect(result).toBe("py-2 px-6");
  });
});

describe("formatCurrency", () => {
  it("should format GEL currency", () => {
    const result = formatCurrency(1500);
    expect(result).toMatch(/1[,.]?500/);
  });

  it("should handle zero", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0/);
  });

  it("should handle decimals", () => {
    const result = formatCurrency(1500.99);
    // Currency is rounded, so 1500.99 becomes 1501
    expect(result).toMatch(/1[,.]?501/);
  });
});

describe("truncate", () => {
  it("should truncate long text", () => {
    const result = truncate("This is a very long text that should be truncated", 20);
    expect(result.length).toBeLessThanOrEqual(23); // 20 + "..."
    expect(result).toContain("...");
  });

  it("should not truncate short text", () => {
    const result = truncate("Short", 20);
    expect(result).toBe("Short");
  });

  it("should handle empty string", () => {
    const result = truncate("", 20);
    expect(result).toBe("");
  });
});
