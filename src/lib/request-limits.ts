import "server-only";

/**
 * Request size limits for different endpoint types
 * Prevents memory exhaustion and DoS attacks
 */
export const REQUEST_SIZE_LIMITS = {
  // JSON request bodies (default)
  json: 1024 * 100, // 100 KB

  // Form data with files (multipart/form-data)
  formData: 100 * 1024 * 1024, // 100 MB total

  // Individual file sizes are already limited in uploads.ts (10 MB)
  // But the multipart form can be larger due to multiple files
} as const;

/**
 * Validate request size
 * Should be called early in request handlers
 */
export function validateRequestSize(req: Request, type: "json" | "formData" = "json"): boolean {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return true; // Allow if no content-length (streaming)

  const length = Number.parseInt(contentLength, 10);
  const limit = REQUEST_SIZE_LIMITS[type];

  if (!Number.isFinite(length)) return true;
  return length <= limit;
}

/**
 * Get human-readable size limit
 */
export function getSizeLimitMB(type: "json" | "formData" = "json"): number {
  return REQUEST_SIZE_LIMITS[type] / (1024 * 1024);
}
