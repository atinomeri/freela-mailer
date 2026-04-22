import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    desktopLedgerEntry: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/desktop-auth", () => ({
  requireDesktopAuth: vi.fn(),
}));

describe("GET /api/desktop/billing/ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({ user: { id: "desktop-user-1" } });
  });

  it("returns paginated ledger entries", async () => {
    (prisma.desktopLedgerEntry.findMany as any).mockResolvedValue([
      {
        id: "l1",
        type: "TOPUP",
        amount: 100,
        balanceBefore: 0,
        balanceAfter: 100,
        currency: "GEL",
        referenceType: "payment",
        referenceId: "p1",
        description: "Admin manual top-up",
        metadata: null,
        createdAt: new Date("2026-04-12T10:00:00.000Z"),
      },
    ]);
    (prisma.desktopLedgerEntry.count as any).mockResolvedValue(1);

    const response = await GET(new Request("http://localhost/api/desktop/billing/ledger?page=1&limit=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});
