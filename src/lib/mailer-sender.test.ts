import {
  isHardBounceError,
  isSenderPolicyError,
  normalizeEmailAddress,
  resolvePreferredFromAddress,
} from "./mailer-sender";

describe("mailer-sender utils", () => {
  it("normalizes angle-bracket address", () => {
    expect(normalizeEmailAddress('Freela Team <No-Reply@Freela.ge>')).toBe(
      "no-reply@freela.ge",
    );
  });

  it("detects sender policy errors", () => {
    const msg =
      "553 5.7.1 <no-reply@freela.ge>: Sender address rejected: not owned by user info@freela.ge";
    expect(isSenderPolicyError(msg)).toBe(true);
  });

  it("does not classify sender policy as hard bounce", () => {
    const msg =
      "553 5.7.1 <no-reply@freela.ge>: Sender address rejected: not owned by user info@freela.ge";
    expect(isHardBounceError(msg)).toBe(false);
  });

  it("classifies recipient hard bounce correctly", () => {
    const msg = "550 5.1.1 user unknown";
    expect(isHardBounceError(msg)).toBe(true);
  });

  it("prefers campaign sender when it matches account identity", () => {
    const from = resolvePreferredFromAddress({
      campaignSenderEmail: "info@freela.ge",
      accountFromEmail: "no-reply@freela.ge",
      accountUsername: "info@freela.ge",
    });
    expect(from).toBe("info@freela.ge");
  });

  it("falls back to account from when campaign sender is not allowed", () => {
    const from = resolvePreferredFromAddress({
      campaignSenderEmail: "marketing@freela.ge",
      accountFromEmail: "no-reply@freela.ge",
      accountUsername: "info@freela.ge",
    });
    expect(from).toBe("no-reply@freela.ge");
  });
});
