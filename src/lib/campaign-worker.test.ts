import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRecipientTemplateData } from "./campaign-worker";
import { verifyUnsubscribeToken } from "./unsubscribe-token";

const ORIGINAL_ENV = {
  unsubscribeTokenSecret: process.env.UNSUBSCRIBE_TOKEN_SECRET,
  nextAuthUrl: process.env.NEXTAUTH_URL,
  unsubscribePageUrl: process.env.UNSUBSCRIBE_PAGE_URL,
  mailerPublicUrl: process.env.MAILER_PUBLIC_URL,
};

describe("campaign worker unsubscribe placeholders", () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = "test-unsubscribe-secret";
    process.env.NEXTAUTH_URL = "https://freela.ge";
    delete process.env.UNSUBSCRIBE_PAGE_URL;
    delete process.env.MAILER_PUBLIC_URL;
  });

  afterEach(() => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = ORIGINAL_ENV.unsubscribeTokenSecret;
    process.env.NEXTAUTH_URL = ORIGINAL_ENV.nextAuthUrl;
    process.env.UNSUBSCRIBE_PAGE_URL = ORIGINAL_ENV.unsubscribePageUrl;
    process.env.MAILER_PUBLIC_URL = ORIGINAL_ENV.mailerPublicUrl;
  });

  it("injects Desktop-compatible unsubscribe placeholders per recipient", () => {
    const row = buildRecipientTemplateData({
      emailColumn: "Email",
      recipientEmail: "User@Test.com",
      contactData: { Name: "Giorgi" },
      desktopUserId: "desktop-1",
    });

    expect(row.Email).toBe("User@Test.com");
    expect(row.Name).toBe("Giorgi");
    expect(row.UNSUBSCRIBE_TOKEN).toBe(row.Email_B64);
    expect(row.UNSUBSCRIBE_URL).toBe(
      `https://freela.ge/unsub?email=${encodeURIComponent(row.Email_B64)}`,
    );

    expect(verifyUnsubscribeToken(row.Email_B64)).toEqual({
      email: "user@test.com",
      desktopUserId: "desktop-1",
    });
  });

  it("replaces [[Email_B64]] in configured unsubscribe page URL templates", () => {
    process.env.UNSUBSCRIBE_PAGE_URL =
      "https://example.com/unsub?email=[[Email_B64]]&source=mailer";

    const row = buildRecipientTemplateData({
      emailColumn: "Email",
      recipientEmail: "test@example.com",
      desktopUserId: "desktop-2",
    });

    expect(row.UNSUBSCRIBE_URL).toContain(
      `email=${encodeURIComponent(row.Email_B64)}`,
    );
    expect(row.UNSUBSCRIBE_URL).toContain("source=mailer");
    expect(row.UNSUBSCRIBE_URL).not.toContain("[[Email_B64]]");
  });
});
