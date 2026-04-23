import { promises as fs } from "fs";
import path from "path";
import { resolveAssetPath } from "@/lib/editor-assets";

type RouteContext = { params: Promise<{ userId: string; fileName: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { userId, fileName } = await params;

    const safeFileName = path.basename(fileName);
    if (!userId || !safeFileName || safeFileName !== fileName) {
      return new Response("Not found", { status: 404 });
    }

    const fullPath = resolveAssetPath(userId, safeFileName);
    const file = await fs.readFile(fullPath);
    const ext = path.extname(safeFileName).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" :
      ext === ".svg" ? "image/svg+xml" :
      "application/octet-stream";

    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
