// Per-user mailer settings: default sender identity + tracking preferences.
// Decoupled from SMTP credentials — those live on DesktopSmtpPoolAccount and
// are picked per campaign via Campaign.sendingAccountId. See
// prisma/migrations/20260429140000_mailer_settings_split for the data move.

import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success } from "@/lib/api-response";
import { upsertDesktopMailerSettingsSchema } from "@/lib/validation";

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
      return { email: maybeEmail, name: maybeName || null };
    }
  }

  if (value.includes("@")) {
    return { email: value, name: null };
  }

  return { email: null, name: value };
}

function normalizeBody(body: unknown): unknown {
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
  const parsedDefaultFrom = parseFromAddress(
    process.env.SMTP_FROM || process.env.SMTP_USER || "",
  );
  return {
    fromEmail: parsedDefaultFrom.email || null,
    fromName: parsedDefaultFrom.name || null,
    trackOpens: process.env.TRACK_OPENS === "true",
    trackClicks: process.env.TRACK_CLICKS === "true",
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const settings = await prisma.desktopMailerSettings.findUnique({
      where: { desktopUserId: auth.user.id },
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        trackOpens: true,
        trackClicks: true,
        updatedAt: true,
      },
    });

    if (!settings) {
      return success({
        ...envDefaults(),
        source: "env" as const,
      });
    }

    return success({ ...settings, source: "user" as const });
  } catch (err) {
    console.error("[Mailer Settings Get] Error:", err);
    return errors.serverError();
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = upsertDesktopMailerSettingsSchema.safeParse(normalizeBody(body));
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const data = parsed.data;

    const updated = await prisma.desktopMailerSettings.upsert({
      where: { desktopUserId: auth.user.id },
      create: {
        desktopUserId: auth.user.id,
        fromEmail: data.fromEmail ?? null,
        fromName: data.fromName ?? null,
        trackOpens: data.trackOpens ?? true,
        trackClicks: data.trackClicks ?? true,
      },
      update: {
        fromEmail: data.fromEmail ?? null,
        fromName: data.fromName ?? null,
        trackOpens: data.trackOpens ?? true,
        trackClicks: data.trackClicks ?? true,
      },
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        trackOpens: true,
        trackClicks: true,
        updatedAt: true,
      },
    });

    return success({ ...updated, source: "user" as const });
  } catch (err) {
    console.error("[Mailer Settings Update] Error:", err);
    return errors.serverError();
  }
}
