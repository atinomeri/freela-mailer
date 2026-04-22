import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import {
  adjustDesktopUserBalance,
  BillingError,
  createDesktopLedgerEntry,
} from "@/lib/desktop-billing";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/desktop-auth", () => ({
  requireDesktopAuth: vi.fn(),
}));

vi.mock("@/lib/desktop-billing", () => ({
  adjustDesktopUserBalance: vi.fn(),
  BillingError: class BillingError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  createDesktopLedgerEntry: vi.fn(),
}));

describe("POST /api/desktop/quota/reserve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({
      user: { id: "desktop-user-1" },
    });
  });

  it("returns idempotent response when key already exists", async () => {
    const tx = {
      desktopLedgerEntry: {
        findUnique: vi.fn().mockResolvedValue({
          referenceType: "quota",
          referenceId: "quota-1",
          balanceAfter: 450,
        }),
      },
      desktopQuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: "quota-1",
          userId: "desktop-user-1",
          allowed: 100,
          charged: 500,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));

    const request = new Request("http://localhost/api/desktop/quota/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 100, idempotency_key: "reserve-1" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quota_id).toBe("quota-1");
    expect(body.idempotent).toBe(true);
    expect(adjustDesktopUserBalance).not.toHaveBeenCalled();
  });

  it("returns 402 when balance is insufficient", async () => {
    const tx = {
      desktopLedgerEntry: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      desktopUser: {
        findUnique: vi.fn().mockResolvedValue({ balance: 3 }),
      },
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));
    (adjustDesktopUserBalance as any).mockRejectedValue(
      new BillingError("INSUFFICIENT_BALANCE", "Insufficient balance"),
    );

    const request = new Request("http://localhost/api/desktop/quota/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 2 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(402);
    expect(createDesktopLedgerEntry).not.toHaveBeenCalled();
  });
});
