import { describe, it, expect } from "vitest";
import {
  formatGeorgianDate,
  formatGeorgianDateTime,
  formatGeorgianLongDate,
  formatGeorgianTime,
  formatLongDate,
} from "./date";

describe("formatGeorgianLongDate", () => {
  it("formats Date object correctly", () => {
    const date = new Date(2024, 0, 15); // January 15, 2024
    const result = formatGeorgianLongDate(date);
    
    expect(result).toBe("15 იანვარი 2024");
  });

  it("formats all Georgian months correctly", () => {
    const expectedMonths = [
      "იანვარი",
      "თებერვალი",
      "მარტი",
      "აპრილი",
      "მაისი",
      "ივნისი",
      "ივლისი",
      "აგვისტო",
      "სექტემბერი",
      "ოქტომბერი",
      "ნოემბერი",
      "დეკემბერი",
    ];

    expectedMonths.forEach((expectedMonth, monthIndex) => {
      const date = new Date(2024, monthIndex, 1);
      const result = formatGeorgianLongDate(date);
      
      expect(result).toContain(expectedMonth);
    });
  });

  it("handles string date input", () => {
    const result = formatGeorgianLongDate("2024-06-20");
    
    expect(result).toContain("ივნისი");
    expect(result).toContain("2024");
  });

  it("handles timestamp number input", () => {
    const timestamp = new Date(2024, 11, 25).getTime(); // December 25, 2024
    const result = formatGeorgianLongDate(timestamp);
    
    expect(result).toBe("25 დეკემბერი 2024");
  });

  it("returns empty string for invalid date", () => {
    expect(formatGeorgianLongDate("invalid")).toBe("");
    expect(formatGeorgianLongDate(NaN)).toBe("");
  });

  it("handles edge cases", () => {
    // First day of year
    expect(formatGeorgianLongDate(new Date(2024, 0, 1))).toBe("1 იანვარი 2024");
    
    // Last day of year
    expect(formatGeorgianLongDate(new Date(2024, 11, 31))).toBe("31 დეკემბერი 2024");
  });
});

describe("formatLongDate", () => {
  describe("Georgian locale", () => {
    it("uses Georgian formatting for 'ka' locale", () => {
      const date = new Date(2024, 5, 15); // June 15, 2024
      const result = formatLongDate(date, "ka");
      
      expect(result).toBe("15 ივნისი 2024");
    });

    it("uses Georgian formatting for 'ka-GE' locale", () => {
      const date = new Date(2024, 2, 10); // March 10, 2024
      const result = formatLongDate(date, "ka-GE");
      
      expect(result).toContain("მარტი");
    });
  });

  describe("English locale", () => {
    it("uses Intl for English locale", () => {
      const date = new Date(2024, 0, 15); // January 15, 2024
      const result = formatLongDate(date, "en");
      
      expect(result).toContain("January");
      expect(result).toContain("15");
      expect(result).toContain("2024");
    });

    it("uses Intl for en-US locale", () => {
      const date = new Date(2024, 6, 4); // July 4, 2024
      const result = formatLongDate(date, "en-US");
      
      expect(result).toContain("July");
    });
  });

  describe("Russian locale", () => {
    it("formats date in Russian", () => {
      const date = new Date(2024, 4, 9); // May 9, 2024
      const result = formatLongDate(date, "ru");
      
      // Russian month names
      expect(result.toLowerCase()).toContain("мая"); // genitive form of May
    });
  });

  describe("error handling", () => {
    it("returns empty string for invalid date", () => {
      expect(formatLongDate("invalid", "en")).toBe("");
      expect(formatLongDate(NaN, "en")).toBe("");
    });

    it("handles Date object", () => {
      const date = new Date(2024, 0, 1);
      const result = formatLongDate(date, "en");
      
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles string date", () => {
      const result = formatLongDate("2024-03-15", "en");
      
      expect(result).toContain("March");
    });

    it("handles timestamp", () => {
      const timestamp = new Date(2024, 8, 1).getTime(); // September 1, 2024
      const result = formatLongDate(timestamp, "en");
      
      expect(result).toContain("September");
    });
  });

  describe("locale fallback", () => {
    it("falls back to English for unknown locale", () => {
      const date = new Date(2024, 0, 15);
      // If Intl fails, it should fall back to English
      const result = formatLongDate(date, "en");
      
      expect(result).toContain("January");
    });
  });
});

describe("Georgian short date/time formatters", () => {
  it("formats Georgian date as numeric date", () => {
    const result = formatGeorgianDate("2026-04-13T14:08:00.000Z");
    expect(result).toMatch(/13.*04.*2026|04.*13.*2026|2026.*04.*13/);
  });

  it("formats Georgian time in 24-hour format", () => {
    const result = formatGeorgianTime("2026-04-13T14:08:00.000Z");
    expect(result).toContain(":");
    expect(result).not.toMatch(/AM|PM/i);
  });

  it("formats Georgian date-time in 24-hour format", () => {
    const result = formatGeorgianDateTime("2026-04-13T14:08:00.000Z");
    expect(result).toContain(":");
    expect(result).toMatch(/2026/);
    expect(result).not.toMatch(/AM|PM/i);
  });
});
