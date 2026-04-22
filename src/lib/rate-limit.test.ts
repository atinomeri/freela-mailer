import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (not needed in tests)
vi.mock("server-only", () => ({}));

// Mock Redis to avoid actual connections
vi.mock("redis", () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  })),
}));

// Mock rate-limit-alerts
vi.mock("./rate-limit-alerts", () => ({
  trackRateLimitBreach: vi.fn(),
}));

// We need to test the exported functions
import { getClientIpFromHeaders, getClientIp, checkRateLimit } from "./rate-limit";

describe("getClientIpFromHeaders", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TRUST_PROXY_HEADERS = "";
  });

  describe("with Headers object", () => {
    it("returns 'unknown' when headers is null", () => {
      expect(getClientIpFromHeaders(null)).toBe("unknown");
    });

    it("returns 'unknown' when headers is undefined", () => {
      expect(getClientIpFromHeaders(undefined)).toBe("unknown");
    });

    it("returns 'unknown' when no IP headers present and proxy not trusted", () => {
      const headers = new Headers();
      expect(getClientIpFromHeaders(headers)).toBe("unknown");
    });

    it("returns 'unknown' when IP headers present but proxy not trusted", () => {
      const headers = new Headers({
        "x-forwarded-for": "192.168.1.1, 10.0.0.1",
        "x-real-ip": "192.168.1.1",
      });
      expect(getClientIpFromHeaders(headers)).toBe("unknown");
    });
  });

  describe("with trusted proxy headers", () => {
    beforeEach(() => {
      process.env.TRUST_PROXY_HEADERS = "true";
    });

    it("returns x-real-ip when available", () => {
      const headers = new Headers({
        "x-real-ip": "192.168.1.100",
      });
      expect(getClientIpFromHeaders(headers)).toBe("192.168.1.100");
    });

    it("returns first IP from x-forwarded-for", () => {
      const headers = new Headers({
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      });
      expect(getClientIpFromHeaders(headers)).toBe("203.0.113.195");
    });

    it("prefers x-real-ip over x-forwarded-for", () => {
      const headers = new Headers({
        "x-real-ip": "10.0.0.50",
        "x-forwarded-for": "192.168.1.1",
      });
      expect(getClientIpFromHeaders(headers)).toBe("10.0.0.50");
    });

    it("trims whitespace from x-real-ip", () => {
      const headers = new Headers({
        "x-real-ip": "  192.168.1.100  ",
      });
      expect(getClientIpFromHeaders(headers)).toBe("192.168.1.100");
    });

    it("returns 'unknown' when x-real-ip is empty string", () => {
      const headers = new Headers({
        "x-real-ip": "   ",
      });
      expect(getClientIpFromHeaders(headers)).toBe("unknown");
    });
  });

  describe("with Record<string, string> headers", () => {
    beforeEach(() => {
      process.env.TRUST_PROXY_HEADERS = "true";
    });

    it("handles Record<string, string> headers", () => {
      const headers: Record<string, string> = {
        "x-real-ip": "172.16.0.1",
      };
      expect(getClientIpFromHeaders(headers)).toBe("172.16.0.1");
    });

    it("handles Record<string, string[]> headers", () => {
      const headers: Record<string, string[]> = {
        "x-forwarded-for": ["10.0.0.1", "10.0.0.2"],
      };
      expect(getClientIpFromHeaders(headers)).toBe("10.0.0.1");
    });
  });
});

describe("getClientIp", () => {
  beforeEach(() => {
    process.env.TRUST_PROXY_HEADERS = "true";
  });

  it("extracts IP from Request object", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-real-ip": "192.168.5.5",
      },
    });
    expect(getClientIp(request)).toBe("192.168.5.5");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    // NODE_ENV is already 'test' in test environment
  });

  it("returns allowed:true in test environment", async () => {
    const result = await checkRateLimit({
      scope: "test",
      key: "test-key",
      limit: 10,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(10);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("works with different scopes", async () => {
    const scopes = ["login:ip", "login:email", "api:global", "password-reset"];
    
    for (const scope of scopes) {
      const result = await checkRateLimit({
        scope,
        key: "test-key",
        limit: 5,
        windowSeconds: 300,
      });
      
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
    }
  });

  it("handles empty key gracefully", async () => {
    const result = await checkRateLimit({
      scope: "test",
      key: "",
      limit: 10,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(true);
  });
});
