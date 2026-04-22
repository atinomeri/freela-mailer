import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    desktopPayment: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/desktop-auth", () => ({
  requireDesktopAuth: vi.fn(),
}));

describe("GET /api/desktop/billing/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({ user: { id: "desktop-user-1" } });
  });

  it("returns paginated payments", async () => {
    (prisma.desktopPayment.findMany as any).mockResolvedValue([
      {
        id: "pay-1",
        amount: 1000,
        currency: "GEL",
        status: "SUCCEEDED",
        provider: "MANUAL",
        externalPaymentId: null,
        metadata: null,
        completedAt: new Date("2026-04-12T10:00:00.000Z"),
        createdAt: new Date("2026-04-12T09:00:00.000Z"),
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
      },
    ]);
    (prisma.desktopPayment.count as any).mockResolvedValue(1);

    const response = await GET(new Request("http://localhost/api/desktop/billing/payments?page=1&limit=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });
});
