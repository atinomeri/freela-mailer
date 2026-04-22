import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success } from "@/lib/api-response";
import { upsertDesktopSmtpConfigSchema } from "@/lib/validation";
import { encryptSecretValue } from "@/lib/secret-crypto";

function parseFromAddress(raw: string | null | undefined): {
  email: string | null;
  name: string | null;
} {
  const value = raw?.trim();
  if (!value) return { email: null, name: null };

  const angleMatch = value.match(/^(?:"?([^"]*)"?\s*)?<\s*([^<>]+)\s*>$/);
  if (angleMatch) {
    const maybeEmail = angleMatch[2]?.trim() || "";
    const maybeName = angleMatch[1]?.trim() || "";
    if (maybeEmail.includes("@")) {
      return {
        email: maybeEmail,
        name: maybeName || null,
      };
    }
  }

  if (value.includes("@")) {
    return { email: value, name: null };
  }

  return { email: null, name: value };
}

function normalizeSmtpBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const next = { ...(body as Record<string, unknown>) };
  const rawFromEmail = typeof next.fromEmail === "string" ? next.fromEmail : null;
  if (!rawFromEmail) return next;

  const parsed = parseFromAddress(rawFromEmail);
  if (parsed.email) {
    next.fromEmail = parsed.email;
    const hasName =
      typeof next.fromName === "string" ? next.fromName.trim().length > 0 : false;
    if (!hasName && parsed.name) {
      next.fromName = parsed.name;
    }
  }

  return next;
}

function envDefaults() {
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure =
    (process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const parsedDefaultFrom = parseFromAddress(
    process.env.SMTP_FROM || process.env.SMTP_USER || "",
  );
  return {
    host: process.env.SMTP_HOST || "",
    port,
    secure,
    username: process.env.SMTP_USER || "",
    fromEmail: parsedDefaultFrom.email || process.env.SMTP_USER || "",
    fromName: parsedDefaultFrom.name || "",
    trackOpens: process.env.TRACK_OPENS === "true",
    trackClicks: process.env.TRACK_CLICKS === "true",
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const config = await prisma.desktopSmtpConfig.findUnique({
      where: { desktopUserId: auth.user.id },
      select: {
        id: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromEmail: true,
        fromName: true,
        trackOpens: true,
        trackClicks: true,
        updatedAt: true,
      },
    });

    if (!config) {
      return success({
        ...envDefaults(),
        hasPassword: Boolean(process.env.SMTP_PASS),
        source: "env",
      });
    }

    return success({
      ...config,
      hasPassword: true,
      source: "user",
    });
  } catch (err) {
    console.error("[SMTP Config Get] Error:", err);
    return errors.serverError();
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const normalizedBody = normalizeSmtpBody(body);
    const parsed = upsertDesktopSmtpConfigSchema.safeParse(normalizedBody);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const data = parsed.data;

    const existing = await prisma.desktopSmtpConfig.findUnique({
      where: { desktopUserId: auth.user.id },
      select: { id: true, passwordEnc: true },
    });

    const passwordEnc = data.password
      ? encryptSecretValue(data.password)
      : existing?.passwordEnc;

    if (!passwordEnc) {
      return errors.badRequest("SMTP password is required for initial setup");
    }

    const updated = await prisma.desktopSmtpConfig.upsert({
      where: { desktopUserId: auth.user.id },
      create: {
        desktopUserId: auth.user.id,
        host: data.host,
        port: data.port,
        secure: data.secure ?? data.port === 465,
        username: data.username,
        passwordEnc,
        fromEmail: data.fromEmail ?? null,
        fromName: data.fromName ?? null,
        trackOpens: data.trackOpens ?? true,
        trackClicks: data.trackClicks ?? true,
      },
      update: {
        host: data.host,
        port: data.port,
        secure: data.secure ?? data.port === 465,
        username: data.username,
        passwordEnc,
        fromEmail: data.fromEmail ?? null,
        fromName: data.fromName ?? null,
        trackOpens: data.trackOpens ?? true,
        trackClicks: data.trackClicks ?? true,
      },
      select: {
        id: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromEmail: true,
        fromName: true,
        trackOpens: true,
        trackClicks: true,
        updatedAt: true,
      },
    });

    return success({ ...updated, hasPassword: true, source: "user" });
  } catch (err) {
    console.error("[SMTP Config Update] Error:", err);
    return errors.serverError();
  }
}
