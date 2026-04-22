import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { encryptSecretValue } from "@/lib/secret-crypto";

type RouteContext = { params: Promise<{ id: string }> };

const providerEnum = z.enum(["gmail", "outlook", "yahoo", "custom"]);
type Provider = z.infer<typeof providerEnum>;
type DbProvider = "GMAIL" | "OUTLOOK" | "YAHOO" | "CUSTOM";

const customSmtpSchema = z.object({
  host: z.string().trim().min(1, "SMTP host is required").max(255),
  port: z.coerce.number().int().min(1, "Port must be at least 1").max(65535, "Port must be at most 65535"),
  secure: z.boolean(),
});

const updateSendingAccountSchema = z.object({
  provider: providerEnum.optional(),
  email: z.string().trim().email("Email must be valid").optional(),
  password: z.string().optional(),
  senderEmail: z.union([z.string().trim().email("Sender Email must be valid"), z.literal(""), z.null()]).optional(),
  senderName: z.union([z.string().max(200), z.literal(""), z.null()]).optional(),
  rotationEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
  customSmtp: customSmtpSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.provider && data.provider !== "custom" && data.customSmtp !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customSmtp"],
      message: "Custom SMTP settings are allowed only for custom provider",
    });
  }
});

function providerToDbValue(provider: Provider): DbProvider {
  if (provider === "gmail") return "GMAIL";
  if (provider === "outlook") return "OUTLOOK";
  if (provider === "yahoo") return "YAHOO";
  return "CUSTOM";
}

function dbProviderToProvider(provider: string): Provider | null {
  const lower = provider.toLowerCase();
  if (lower === "gmail" || lower === "outlook" || lower === "yahoo" || lower === "custom") {
    return lower;
  }
  return null;
}

function resolveProviderSmtp(provider: Provider): { host: string; port: number; secure: boolean } {
  if (provider === "gmail") return { host: "smtp.gmail.com", port: 465, secure: true };
  if (provider === "outlook") return { host: "smtp.office365.com", port: 587, secure: false };
  if (provider === "yahoo") return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
  return { host: "", port: 465, secure: true };
}

function sanitizeOptionalEmail(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizeOptionalName(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function shouldResetStatusToNotTested(changes: {
  providerChanged: boolean;
  smtpChanged: boolean;
  usernameChanged: boolean;
  passwordChanged: boolean;
}): boolean {
  return changes.providerChanged || changes.smtpChanged || changes.usernameChanged || changes.passwordChanged;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await prisma.desktopSendingAccount.findUnique({
      where: { id },
      select: {
        id: true,
        desktopUserId: true,
        provider: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        senderEmail: true,
        senderName: true,
        rotationEnabled: true,
        active: true,
        status: true,
        failCount: true,
      },
    });

    if (!existing) return errors.notFound("Sending account");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = updateSendingAccountSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);
    const data = parsed.data;

    const currentProvider = dbProviderToProvider(existing.provider);
    if (!currentProvider) return errors.badRequest("Stored account has invalid provider.");
    const nextProvider = data.provider ?? currentProvider;

    if (nextProvider === "custom") {
      // Rule: if provider remains CUSTOM and customSmtp is omitted, reuse existing custom SMTP settings.
      // Only when switching from a non-custom provider to CUSTOM do we require explicit customSmtp input.
      if (data.provider === "custom" && currentProvider !== "custom" && !data.customSmtp) {
        return errors.badRequest("Custom SMTP settings are required when switching to custom provider.");
      }
    } else if (data.customSmtp !== undefined) {
      return errors.badRequest("Custom SMTP settings are allowed only for custom provider.");
    }

    const nextSmtp =
      nextProvider === "custom"
        ? {
            host: data.customSmtp?.host.trim() ?? existing.host,
            port: data.customSmtp?.port ?? existing.port,
            secure: data.customSmtp?.secure ?? existing.secure,
          }
        : resolveProviderSmtp(nextProvider);

    const nextUsername = data.email ?? existing.username;
    const passwordProvided = data.password !== undefined;
    if (passwordProvided && !data.password?.trim()) {
      return errors.badRequest("Password is required");
    }

    const providerChanged = nextProvider !== currentProvider;
    const smtpChanged =
      nextSmtp.host !== existing.host ||
      nextSmtp.port !== existing.port ||
      nextSmtp.secure !== existing.secure;
    const usernameChanged = nextUsername !== existing.username;
    const passwordChanged = passwordProvided;
    const active = data.active ?? existing.active;

    const nextStatus = active
      ? shouldResetStatusToNotTested({ providerChanged, smtpChanged, usernameChanged, passwordChanged })
        ? "NOT_TESTED"
        : existing.status
      : "PAUSED";

    const updateData: {
      provider: DbProvider;
      host: string;
      port: number;
      secure: boolean;
      username: string;
      senderEmail?: string | null;
      senderName?: string | null;
      rotationEnabled?: boolean;
      active: boolean;
      status: "NOT_TESTED" | "CONNECTED" | "FAILED" | "NEEDS_ATTENTION" | "PAUSED" | "TESTING";
      failCount?: number;
      passwordEnc?: string;
      lastTestSuccess?: boolean | null;
      lastTestError?: string | null;
      lastTestedAt?: Date | null;
      lastTestLatencyMs?: number | null;
    } = {
      provider: providerToDbValue(nextProvider),
      host: nextSmtp.host,
      port: nextSmtp.port,
      secure: nextSmtp.secure,
      username: nextUsername,
      active,
      status: nextStatus,
    };

    if (data.senderEmail !== undefined) {
      updateData.senderEmail = sanitizeOptionalEmail(data.senderEmail);
    }
    if (data.senderName !== undefined) {
      updateData.senderName = sanitizeOptionalName(data.senderName);
    }
    if (data.rotationEnabled !== undefined) {
      updateData.rotationEnabled = data.rotationEnabled;
    }
    if (passwordProvided) {
      updateData.passwordEnc = encryptSecretValue(data.password!);
    }

    if (active && nextStatus === "NOT_TESTED") {
      updateData.failCount = 0;
      updateData.lastTestSuccess = null;
      updateData.lastTestError = null;
      updateData.lastTestedAt = null;
      updateData.lastTestLatencyMs = null;
    }

    const updated = await prisma.desktopSendingAccount.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        provider: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        senderEmail: true,
        senderName: true,
        rotationEnabled: true,
        active: true,
        status: true,
        failCount: true,
        lastTestedAt: true,
        lastTestSuccess: true,
        lastTestError: true,
        lastTestLatencyMs: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success(updated);
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Unknown error";
    const safeCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code ?? "UNKNOWN")
        : "UNKNOWN";
    console.error("[Sending Accounts Update] Error", {
      route: "desktop/sending-accounts/[id]#PATCH",
      message: safeMessage,
      code: safeCode,
    });
    return errors.serverError();
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await prisma.desktopSendingAccount.findUnique({
      where: { id },
      select: { id: true, desktopUserId: true },
    });

    if (!existing) return errors.notFound("Sending account");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

    await prisma.desktopSendingAccount.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Unknown error";
    const safeCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code ?? "UNKNOWN")
        : "UNKNOWN";
    console.error("[Sending Accounts Delete] Error", {
      route: "desktop/sending-accounts/[id]#DELETE",
      message: safeMessage,
      code: safeCode,
    });
    return errors.serverError();
  }
}
