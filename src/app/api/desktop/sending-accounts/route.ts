import { z } from "zod";
import { created, errors, success } from "@/lib/api-response";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { encryptSecretValue } from "@/lib/secret-crypto";

const providerEnum = z.enum(["gmail", "outlook", "yahoo", "custom"]);
type Provider = z.infer<typeof providerEnum>;

const customSmtpSchema = z.object({
  host: z.string().trim().min(1, "SMTP host is required").max(255),
  port: z.coerce.number().int().min(1, "Port must be at least 1").max(65535, "Port must be at most 65535"),
  secure: z.boolean(),
});

const createSendingAccountSchema = z.object({
  provider: providerEnum,
  email: z.string().trim().email("Email must be valid"),
  password: z.string().min(1, "Password is required"),
  senderEmail: z.union([z.string().trim().email("Sender Email must be valid"), z.literal(""), z.null()]).optional(),
  senderName: z.union([z.string().max(200), z.literal(""), z.null()]).optional(),
  rotationEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
  customSmtp: customSmtpSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.provider === "custom" && !data.customSmtp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customSmtp"],
      message: "Custom SMTP settings are required for custom provider",
    });
  }
  if (data.provider !== "custom" && data.customSmtp !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customSmtp"],
      message: "Custom SMTP settings are allowed only for custom provider",
    });
  }
});

function resolveProviderSmtp(provider: Provider): { host: string; port: number; secure: boolean } {
  if (provider === "gmail") return { host: "smtp.gmail.com", port: 465, secure: true };
  if (provider === "outlook") return { host: "smtp.office365.com", port: 587, secure: false };
  if (provider === "yahoo") return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
  return { host: "", port: 465, secure: true };
}

function providerToDbValue(provider: Provider): "GMAIL" | "OUTLOOK" | "YAHOO" | "CUSTOM" {
  if (provider === "gmail") return "GMAIL";
  if (provider === "outlook") return "OUTLOOK";
  if (provider === "yahoo") return "YAHOO";
  return "CUSTOM";
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

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const accounts = await prisma.desktopSendingAccount.findMany({
      where: { desktopUserId: auth.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        username: true,
        senderEmail: true,
        senderName: true,
        rotationEnabled: true,
        active: true,
        status: true,
        lastTestSuccess: true,
        lastTestError: true,
        lastTestedAt: true,
      },
    });

    return success(accounts);
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Unknown error";
    const safeCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code ?? "UNKNOWN")
        : "UNKNOWN";
    console.error("[Sending Accounts List] Error", {
      route: "desktop/sending-accounts#GET",
      message: safeMessage,
      code: safeCode,
    });
    return errors.serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = createSendingAccountSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);
    const data = parsed.data;

    const smtp =
      data.provider === "custom"
        ? {
            host: data.customSmtp!.host.trim(),
            port: data.customSmtp!.port,
            secure: data.customSmtp!.secure,
          }
        : resolveProviderSmtp(data.provider);

    const active = data.active ?? true;
    const status = active ? "NOT_TESTED" : "PAUSED";
    const senderEmail = sanitizeOptionalEmail(data.senderEmail ?? null);
    const senderName = sanitizeOptionalName(data.senderName ?? null);

    if (!data.password.trim()) {
      return errors.badRequest("Password is required");
    }

    const account = await prisma.desktopSendingAccount.create({
      data: {
        desktopUserId: auth.user.id,
        provider: providerToDbValue(data.provider),
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        username: data.email,
        passwordEnc: encryptSecretValue(data.password),
        senderEmail,
        senderName,
        rotationEnabled: data.rotationEnabled ?? true,
        active,
        status,
        failCount: 0,
        lastTestedAt: null,
        lastTestSuccess: null,
        lastTestError: null,
        lastTestLatencyMs: null,
      },
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

    return created(account);
  } catch (err) {
    console.error("[Sending Accounts Create] Error:", err);
    return errors.serverError();
  }
}
