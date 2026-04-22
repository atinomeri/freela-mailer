import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import {
  adjustDesktopUserBalance,
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
  createDesktopLedgerEntry: vi.fn(),
}));

describe("POST /api/desktop/quota/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({
      user: { id: "desktop-user-1" },
    });
  });

  it("returns 404 when quota does not exist", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));

    const request = new Request("http://localhost/api/desktop/quota/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quota_id: "missing", sent: 1, failed: 0 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("returns idempotent success when same report is resent", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "quota-1",
          userId: "desktop-user-1",
          allowed: 100,
          sent: 80,
          failed: 20,
          refunded: 100,
          status: "reported",
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]),
      desktopUser: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ balance: 500 }),
      },
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));

    const request = new Request("http://localhost/api/desktop/quota/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quota_id: "quota-1", sent: 80, failed: 20 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.idempotent).toBe(true);
    expect(body.refunded).toBe(100);
    expect(adjustDesktopUserBalance).not.toHaveBeenCalled();
    expect(createDesktopLedgerEntry).not.toHaveBeenCalled();
  });

  it("refunds failed sends and records ledger entry", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "quota-2",
          userId: "desktop-user-1",
          allowed: 100,
          sent: 0,
          failed: 0,
          refunded: 0,
          status: "active",
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]),
      desktopQuota: {
        update: vi.fn().mockResolvedValue({}),
      },
      desktopUser: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ balance: 700 }),
      },
    };
    (prisma.$transaction as any).mockImplementation((cb: any) => cb(tx));
    (adjustDesktopUserBalance as any).mockResolvedValue({ before: 690, after: 700 });
    (createDesktopLedgerEntry as any).mockResolvedValue({});

    const request = new Request("http://localhost/api/desktop/quota/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quota_id: "quota-2",
        sent: 8,
        failed: 2,
        idempotency_key: "abc",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.refunded).toBe(10);
    expect(body.idempotent).toBe(false);
    expect(adjustDesktopUserBalance).toHaveBeenCalledWith(tx, "desktop-user-1", 10);
    expect(createDesktopLedgerEntry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: "QUOTA_REFUND",
        amount: 10,
        referenceId: "quota-2",
      }),
    );
  });
});
