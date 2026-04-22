/**
 * API Response helpers for consistent response formatting
 * Provides type-safe success and error responses
 */

import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";
import { reportError } from "./logger";

// ============================================
// Response Types
// ============================================

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================
// Success Responses
// ============================================

export function success<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function successWithPagination<T>(
  data: T,
  pagination: { page: number; pageSize: number; total: number }
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({
    ok: true,
    data,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      hasMore: pagination.page * pagination.pageSize < pagination.total,
    },
  });
}

export function created<T>(data: T): NextResponse<ApiSuccessResponse<T>> {
  return success(data, 201);
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ============================================
// Error Responses
// ============================================

export function error(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, details },
    },
    { status }
  );
}

// Common error responses
export const errors = {
  badRequest: (message = "Bad request", details?: unknown) =>
    error("BAD_REQUEST", message, 400, details),

  unauthorized: (message = "Unauthorized") =>
    error("UNAUTHORIZED", message, 401),

  forbidden: (message = "Forbidden") =>
    error("FORBIDDEN", message, 403),

  notFound: (resource = "Resource") =>
    error("NOT_FOUND", `${resource} not found`, 404),

  conflict: (message = "Conflict") =>
    error("CONFLICT", message, 409),

  validationError: (issues: ZodIssue[]) =>
    error(
      "VALIDATION_ERROR",
      "Validation failed",
      400,
      issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }))
    ),

  rateLimited: (retryAfter?: number) =>
    NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests, please try again later",
          retryAfter,
        },
      },
      {
        status: 429,
        headers: retryAfter ? { "Retry-After": String(retryAfter) } : {},
      }
    ),

  serverError: (message = "Internal server error") =>
    error("SERVER_ERROR", message, 500),
};

// ============================================
// Utility for wrapping API handlers
// ============================================

type ApiHandler<T = unknown> = (
  req: Request,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse<ApiResponse<T>>>;

/**
 * Wrap an API handler with error handling and logging
 */
export function withErrorHandler<T>(handler: ApiHandler<T>): ApiHandler<T> {
  return async (req, context) => {
    const start = Date.now();
    try {
      const response = await handler(req, context);
      return response;
    } catch (err) {
      const duration = Date.now() - start;
      reportError(`[API Error] ${req.method} ${new URL(req.url).pathname} (${duration}ms)`, err);

      if (err instanceof Error) {
        // Don't expose internal error messages in production
        const message =
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : err.message;
        return errors.serverError(message);
      }
      return errors.serverError();
    }
  };
}
