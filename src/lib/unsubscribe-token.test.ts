import { beforeEach, describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

describe("unsubscribe-token", () => {
  const SECRET = "phase7-secret";

  beforeEach(() => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET;
    delete process.env.UNSUBSCRIBE_ALLOW_LEGACY;
  });

  it("creates and verifies signed token with desktop user id", () => {
    const token = createUnsubscribeToken("User@Test.com", "desktop-1");
    const payload = verifyUnsubscribeToken(token);

    expect(payload).toEqual({
      email: "user@test.com",
      desktopUserId: "desktop-1",
    });
  });

  it("rejects token with invalid signature", () => {
    const token = createUnsubscribeToken("user@test.com");
    const [payloadB64] = token.split(".", 1);
    const tampered = `${payloadB64}.deadbeef`;

    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("accepts legacy 32-char truncated signatures", () => {
    const token = createUnsubscribeToken("user@test.com");
    const [payloadB64, sig] = token.split(".");
    const truncated = `${payloadB64}.${sig.slice(0, 32)}`;

    expect(verifyUnsubscribeToken(truncated)).toEqual({
      email: "user@test.com",
    });
  });

  it("rejects unsigned legacy token by default", () => {
    const unsigned = Buffer.from("user@test.com", "utf-8").toString("base64url");
    expect(verifyUnsubscribeToken(unsigned)).toBeNull();
  });

  it("allows unsigned legacy token only when opt-in is enabled", () => {
    const unsigned = Buffer.from("user@test.com", "utf-8").toString("base64url");

    expect(verifyUnsubscribeToken(unsigned, { allowLegacy: true })).toEqual({
      email: "user@test.com",
    });

    process.env.UNSUBSCRIBE_ALLOW_LEGACY = "true";
    expect(verifyUnsubscribeToken(unsigned)).toEqual({
      email: "user@test.com",
    });
  });
});
