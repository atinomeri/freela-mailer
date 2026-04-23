import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success } from "@/lib/api-response";
import {
  ALLOWED_EDITOR_IMAGE_MIME,
  buildAssetPublicUrl,
  MAX_EDITOR_IMAGE_SIZE,
  resolveUserAssetsDir,
  sanitizeFilename,
} from "@/lib/editor-assets";
import { validateRequestSize } from "@/lib/request-limits";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

function getAssetFileName(originalName: string): string {
  const ext = path.extname(originalName || "").toLowerCase();
  const base = sanitizeFilename(path.basename(originalName || "image", ext));
  return `${Date.now()}-${randomUUID()}-${base}${ext}`;
}

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? `${DEFAULT_LIMIT}`);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(rawLimit)))
      : DEFAULT_LIMIT;

    const dir = resolveUserAssetsDir(auth.user.id);
    await fs.mkdir(dir, { recursive: true });

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            name: entry.name,
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
            url: buildAssetPublicUrl(auth.user.id, entry.name),
          };
        }),
    );

    files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return success(files.slice(0, limit));
  } catch (err) {
    console.error("[Editor Assets List] Error:", err);
    return errors.serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    if (!validateRequestSize(req, "formData")) {
      return errors.badRequest("Request body is too large");
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) return errors.badRequest("Expected multipart form data");

    const rawFiles = formData.getAll("files");
    const normalized = rawFiles
      .filter((item): item is File => item instanceof File)
      .filter((file) => file.size > 0);

    const files = normalized.length > 0
      ? normalized
      : (() => {
          const one = formData.get("file");
          return one instanceof File && one.size > 0 ? [one] : [];
        })();

    if (files.length === 0) {
      return errors.badRequest("No images uploaded");
    }

    const userDir = resolveUserAssetsDir(auth.user.id);
    await fs.mkdir(userDir, { recursive: true });

    const uploaded: Array<{
      name: string;
      size: number;
      type: string;
      url: string;
    }> = [];

    for (const file of files) {
      if (!ALLOWED_EDITOR_IMAGE_MIME.has(file.type)) {
        return errors.badRequest(`Unsupported file type: ${file.type || "unknown"}`);
      }
      if (file.size > MAX_EDITOR_IMAGE_SIZE) {
        return errors.badRequest(`Image too large. Max ${MAX_EDITOR_IMAGE_SIZE / 1024 / 1024} MB`);
      }

      const storedName = getAssetFileName(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(userDir, storedName), buffer);

      uploaded.push({
        name: storedName,
        size: file.size,
        type: file.type,
        url: buildAssetPublicUrl(auth.user.id, storedName),
      });
    }

    return success(uploaded);
  } catch (err) {
    console.error("[Editor Assets Upload] Error:", err);
    return errors.serverError();
  }
}
