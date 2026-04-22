import nodemailer from "nodemailer";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { decryptSecretValue } from "@/lib/secret-crypto";

const providerEnum = z.enum(["gmail", "outlook", "yahoo", "custom"]);

const customSmtpSchema = z.object({
  host: z.string().trim().min(1, "SMTP host is required").max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
});

const testSendingAccountSchema = z.object({
  accountId: z.string().cuid().optional(),
  provider: providerEnum.optional(),
  email: z.string().email("Email must be valid").optional(),
  password: z.string().min(1, "Password is required").optional(),
  senderEmail: z.string().email("Sender Email must be valid").nullable().optional(),
  customSmtp: customSmtpSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.accountId) return;

  if (!data.provider) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["provider"],
      message: "Provider is required",
    });
    return;
  }

  if (!data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Email is required",
    });
  }

  if (!data.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "Password is required",
    });
  }

  if (data.provider === "custom" && !data.customSmtp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customSmtp"],
      message: "Custom SMTP settings are required",
    });
  }
});

type Provider = z.infer<typeof providerEnum>;

function resolveProviderSmtp(provider: Provider): { host: string; port: number; secure: boolean } {
  if (provider === "gmail") return { host: "smtp.gmail.com", port: 465, secure: true };
  if (provider === "outlook") return { host: "smtp.office365.com", port: 587, secure: false };
  if (provider === "yahoo") return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
  return { host: "", port: 465, secure: true };
}

function normalizeProvider(value: string): Provider | null {
  const provider = value.toLowerCase();
  if (provider === "gmail" || provider === "outlook" || provider === "yahoo" || provider === "custom") {
    return provider;
  }
  return null;
}

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
  return trimmed.slice(atIndex + 1);
}

function mapFriendlySmtpError(code: string | null, provider: Provider): string {
  if (code === "EAUTH") {
    if (provider === "gmail" || provider === "yahoo") {
      return "App password required.";
    }
    return "Wrong password. Please try again.";
  }

  if (code === "ETIMEDOUT") {
    return "SMTP server not responding.";
  }

  if (code === "ECONNECTION" || code === "ENOTFOUND") {
    return "Connection failed.";
  }

  return "Connection failed.";
}

function providerToDbValue(provider: Provider): "GMAIL" | "OUTLOOK" | "YAHOO" | "CUSTOM" {
  if (provider === "gmail") return "GMAIL";
  if (provider === "outlook") return "OUTLOOK";
  if (provider === "yahoo") return "YAHOO";
  return "CUSTOM";
}

export async function POST(req: Request) {
  const auth = await requireDesktopAuth(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return errors.badRequest("Invalid JSON body");

  const parsed = testSendingAccountSchema.safeParse(body);
  if (!parsed.success) return errors.validationError(parsed.error.issues);

  const data = parsed.data;
  const startedAt = Date.now();
  const testedAt = new Date();

  let accountId: string | null = null;
  let active = true;
  let provider: Provider;
  let username: string;
  let password: string;
  let host: string;
  let port: number;
  let secure: boolean;
  let failCount = 0;
  let senderEmail: string | null = data.senderEmail ?? null;

  if (data.accountId) {
    const account = await prisma.desktopSendingAccount.findUnique({
      where: { id: data.accountId },
      select: {
        id: true,
        desktopUserId: true,
        provider: true,
        username: true,
        passwordEnc: true,
        host: true,
        port: true,
        secure: true,
        senderEmail: true,
        active: true,
        failCount: true,
      },
    });

    if (!account) return errors.notFound("Sending account");
    if (account.desktopUserId !== auth.user.id) return errors.forbidden();

    accountId = account.id;
    active = account.active;
    failCount = account.failCount;
    const normalized = normalizeProvider(account.provider);
    if (!normalized) {
      return errors.badRequest("Stored account has invalid provider.");
    }
    provider = normalized;
    username = account.username;
    password = data.password?.trim() ? data.password : decryptSecretValue(account.passwordEnc);
    senderEmail = senderEmail ?? account.senderEmail ?? null;

    if (provider === "custom") {
      host = account.host;
      port = account.port;
      secure = account.secure;
    } else {
      const mapped = resolveProviderSmtp(provider);
      host = mapped.host;
      port = mapped.port;
      secure = mapped.secure;
    }
  } else {
    provider = data.provider!;
    username = data.email!;
    password = data.password!;
    senderEmail = senderEmail ?? null;

    if (provider === "custom") {
      host = data.customSmtp!.host.trim();
      port = data.customSmtp!.port;
      secure = data.customSmtp!.secure;
    } else {
      const mapped = resolveProviderSmtp(provider);
      host = mapped.host;
      port = mapped.port;
      secure = mapped.secure;
    }
  }

  const effectiveSender = senderEmail?.trim() ? senderEmail.trim() : username;
  const warnings: string[] = [];
  const senderDomain = domainOf(effectiveSender);
  const usernameDomain = domainOf(username);
  if (senderDomain && usernameDomain && senderDomain !== usernameDomain) {
    warnings.push("Sender Email domain differs from account email domain. Deliverability may be reduced.");
  }

  if (!password.trim()) {
    return errors.badRequest("Password is required.");
  }

  try {
    const implicitTls = secure || port === 465;
    const startTls = !implicitTls && port === 587;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: implicitTls,
      requireTLS: startTls,
      ignoreTLS: false,
      auth: { user: username, pass: password },
      tls: {
        minVersion: "TLSv1.2",
        servername: host,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    await transporter.verify();
    const latencyMs = Date.now() - startedAt;

    if (accountId) {
      await prisma.desktopSendingAccount.update({
        where: { id: accountId },
        data: {
          provider: providerToDbValue(provider),
          host,
          port,
          secure,
          username,
          senderEmail: senderEmail?.trim() ? senderEmail.trim() : null,
          status: active ? "CONNECTED" : "PAUSED",
          failCount: 0,
          lastTestedAt: testedAt,
          lastTestSuccess: true,
          lastTestError: null,
          lastTestLatencyMs: latencyMs,
        },
      });
    }

    return success({
      connected: true,
      provider,
      smtp: { host, port, secure },
      effectiveSender,
      warnings,
      test: {
        at: testedAt.toISOString(),
        success: true,
        latencyMs,
      },
      status: active ? "CONNECTED" : "PAUSED",
      accountUpdated: Boolean(accountId),
    });
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "").toUpperCase()
      : null;
    const friendly = mapFriendlySmtpError(code, provider);
    const latencyMs = Date.now() - startedAt;

    if (accountId) {
      const nextFailCount = failCount + 1;
      const nextStatus = active ? "FAILED" : "PAUSED";

      await prisma.desktopSendingAccount.update({
        where: { id: accountId },
        data: {
          status: nextStatus,
          failCount: nextFailCount,
          lastTestedAt: testedAt,
          lastTestSuccess: false,
          lastTestError: friendly,
          lastTestLatencyMs: latencyMs,
        },
      });
    }

    return errors.badRequest(friendly, {
      provider,
      warnings,
      test: {
        at: testedAt.toISOString(),
        success: false,
        latencyMs,
      },
      status: accountId ? undefined : "FAILED",
      accountUpdated: Boolean(accountId),
    });
  }
}
