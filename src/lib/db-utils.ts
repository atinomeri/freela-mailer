/**
 * Database query optimization utilities
 * Helpers for efficient Prisma queries
 */

import { Prisma } from "@prisma/client";

// ============================================
// Pagination Helpers
// ============================================

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

/**
 * Parse and validate pagination parameters
 */
export function parsePagination(
  params: PaginationParams,
  defaults: { page?: number; pageSize?: number; maxPageSize?: number } = {}
): PaginationResult {
  const { page: defaultPage = 1, pageSize: defaultPageSize = 20, maxPageSize = 100 } = defaults;

  const page = Math.max(1, params.page ?? defaultPage);
  const pageSize = Math.min(maxPageSize, Math.max(1, params.pageSize ?? defaultPageSize));

  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    page,
    pageSize,
  };
}

/**
 * Calculate pagination metadata
 */
export function paginationMeta(
  total: number,
  pagination: PaginationResult
): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1,
  };
}

// ============================================
// Select Field Optimization
// ============================================

/**
 * Create a select object for user profiles (reduces data transfer)
 */
export const userProfileSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

/**
 * Create a select object for freelancer profiles (Profile model in schema)
 */
export const freelancerProfileSelect = {
  id: true,
  bio: true,
  category: true,
  hourlyGEL: true,
  skills: true,
  user: {
    select: userProfileSelect,
  },
} as const satisfies Prisma.ProfileSelect;

/**
 * Create a select object for project listings
 */
export const projectListingSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  budgetGEL: true,
  isOpen: true,
  city: true,
  createdAt: true,
  employer: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: {
    select: {
      proposals: true,
    },
  },
} as const satisfies Prisma.ProjectSelect;

/**
 * Create a select object for proposals
 */
export const proposalSelect = {
  id: true,
  message: true,
  priceGEL: true,
  status: true,
  createdAt: true,
  freelancer: {
    select: {
      id: true,
      name: true,
      profile: {
        select: {
          hourlyGEL: true,
          category: true,
        },
      },
    },
  },
} as const satisfies Prisma.ProposalSelect;

// ============================================
// Query Building Helpers
// ============================================

/**
 * Build a search filter for text fields
 */
export function buildSearchFilter(
  query: string | null | undefined,
  fields: string[]
): Prisma.StringFilter | undefined {
  if (!query?.trim()) return undefined;

  const searchTerm = query.trim();
  return {
    contains: searchTerm,
    mode: "insensitive" as const,
  };
}

/**
 * Build an OR search across multiple fields
 */
export function buildMultiFieldSearch(
  query: string | null | undefined,
  fields: string[]
): object[] | undefined {
  if (!query?.trim()) return undefined;

  const searchTerm = query.trim();
  return fields.map((field) => ({
    [field]: {
      contains: searchTerm,
      mode: "insensitive" as const,
    },
  }));
}

/**
 * Build a date range filter
 */
export function buildDateRangeFilter(
  from?: Date | string | null,
  to?: Date | string | null
): Prisma.DateTimeFilter | undefined {
  const filters: Prisma.DateTimeFilter = {};

  if (from) {
    filters.gte = typeof from === "string" ? new Date(from) : from;
  }
  if (to) {
    filters.lte = typeof to === "string" ? new Date(to) : to;
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
}

/**
 * Build a number range filter
 */
export function buildNumberRangeFilter(
  min?: number | null,
  max?: number | null
): Prisma.IntFilter | undefined {
  const filters: Prisma.IntFilter = {};

  if (min !== null && min !== undefined) {
    filters.gte = min;
  }
  if (max !== null && max !== undefined) {
    filters.lte = max;
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
}

// ============================================
// Transaction Helpers
// ============================================

/**
 * Retry a transaction on conflict
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Only retry on specific Prisma errors (write conflicts, etc.)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (["P2002", "P2034"].includes(error.code)) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
          continue;
        }
      }

      // Don't retry other errors
      throw error;
    }
  }

  throw lastError;
}

// ============================================
// Batch Operations
// ============================================

/**
 * Process items in batches to avoid memory issues
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
