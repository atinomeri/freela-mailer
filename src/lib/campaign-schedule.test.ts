import { describe, expect, it } from "vitest";

import {
  deriveDailySendTimeFromDate,
  nextDailyRunAfter,
  nextDailyRunFrom,
} from "./campaign-schedule";

describe("campaign schedule timezone behavior (Asia/Tbilisi)", () => {
  it("derives HH:MM using Tbilisi wall-clock from UTC date", () => {
    expect(deriveDailySendTimeFromDate(new Date("2026-04-14T06:00:00.000Z"))).toBe("10:00");
  });

  it("computes same-day next run when target time is still ahead", () => {
    const now = new Date("2026-04-14T05:00:00.000Z"); // 09:00 in Tbilisi
    const next = nextDailyRunFrom(now, "10:00");
    expect(next.toISOString()).toBe("2026-04-14T06:00:00.000Z");
  });

  it("rolls to next day when target time has passed", () => {
    const now = new Date("2026-04-14T06:01:00.000Z"); // 10:01 in Tbilisi
    const next = nextDailyRunFrom(now, "10:00");
    expect(next.toISOString()).toBe("2026-04-15T06:00:00.000Z");
  });

  it("keeps daily run time while shifting one day forward", () => {
    const current = new Date("2026-04-14T06:00:00.000Z"); // 10:00 in Tbilisi
    const next = nextDailyRunAfter(current, "10:00");
    expect(next.toISOString()).toBe("2026-04-15T06:00:00.000Z");
  });
});
