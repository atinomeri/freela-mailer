import "server-only";

import path from "path";

export const EDITOR_ASSETS_DIR =
  process.env.MAILER_EDITOR_ASSETS_DIR?.trim() ||
  path.join(process.cwd(), "data", "editor-assets");

export const MAX_EDITOR_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_EDITOR_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export function sanitizeFilename(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, "-");
  const clean = normalized.replace(/[^a-z0-9._-]/g, "");
  return clean || "image";
}

export function resolveUserAssetsDir(userId: string): string {
  return path.join(EDITOR_ASSETS_DIR, userId);
}

export function resolveAssetPath(userId: string, fileName: string): string {
  return path.join(resolveUserAssetsDir(userId), fileName);
}

export function buildAssetPublicUrl(userId: string, fileName: string, origin?: string): string {
  const path = `/api/editor-assets/${encodeURIComponent(userId)}/${encodeURIComponent(fileName)}`;
  return origin ? `${origin}${path}` : path;
}
