/**
 * Zod validation schemas for API routes
 * Centralized validation to ensure type safety across the application
 */

import { z } from "zod";

// ============================================
// Common schemas
// ============================================

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .transform((v) => v.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[^\d+]/g, "").trim())
  .refine((v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  }, "Invalid phone number");

export const personalIdSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 11, "Personal ID must be 11 digits");

export const companyIdSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 9, "Company ID must be 9 digits");

export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .transform((v) => new Date(v))
  .refine((d) => !isNaN(d.getTime()), "Invalid date")
  .refine((d) => d <= new Date(), "Birth date cannot be in the future")
  .refine((d) => d.getFullYear() >= 1900, "Invalid birth year");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================
// Freelancer categories (mirrors lib/categories.ts)
// ============================================

export const freelancerCategorySchema = z.enum([
  "web_development",
  "mobile_development",
  "design",
  "writing",
  "marketing",
  "video",
  "music",
  "translation",
  "consulting",
  "other",
]);

export type FreelancerCategoryType = z.infer<typeof freelancerCategorySchema>;

// ============================================
// Registration schemas
// ============================================

const baseRegistrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  phone: phoneSchema,
});

export const freelancerRegistrationSchema = baseRegistrationSchema.extend({
  role: z.literal("freelancer"),
  category: freelancerCategorySchema,
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  personalId: personalIdSchema,
  birthDate: birthDateSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const individualEmployerRegistrationSchema = baseRegistrationSchema.extend({
  role: z.literal("employer"),
  employerType: z.literal("individual"),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  personalId: personalIdSchema,
  birthDate: birthDateSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const companyEmployerRegistrationSchema = baseRegistrationSchema.extend({
  role: z.literal("employer"),
  employerType: z.literal("company"),
  companyName: z.string().min(2, "Company name must be at least 2 characters").max(200),
  companyId: companyIdSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// For registration, use the individual schemas directly
// registrationSchema was causing issues with nested discriminated unions
// Use freelancerRegistrationSchema, individualEmployerRegistrationSchema, 
// or companyEmployerRegistrationSchema based on the role/employerType

// ============================================
// Project schemas
// ============================================

export const projectCategorySchema = z.enum([
  "web_development",
  "mobile_development",
  "design",
  "writing",
  "marketing",
  "video",
  "music",
  "translation",
  "consulting",
  "other",
]);

export const createProjectSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(20, "Description must be at least 20 characters").max(5000),
  category: projectCategorySchema,
  budget: z.coerce.number().positive("Budget must be positive"),
  deadline: z.string().datetime().optional(),
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "completed", "cancelled"]),
});

// ============================================
// Proposal schemas
// ============================================

export const createProposalSchema = z.object({
  projectId: z.string().cuid(),
  coverLetter: z.string().min(50, "Cover letter must be at least 50 characters").max(2000),
  proposedBudget: z.coerce.number().positive("Budget must be positive"),
  estimatedDays: z.coerce.number().int().min(1).max(365),
});

export const updateProposalStatusSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
});

// ============================================
// Message schemas
// ============================================

export const createMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(5000),
  attachments: z.array(z.string().url()).max(10).optional(),
});

export const createThreadSchema = z.object({
  recipientId: z.string().cuid(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().min(1, "Message cannot be empty").max(5000),
});

// ============================================
// Review schemas
// ============================================

export const createReviewSchema = z.object({
  projectId: z.string().cuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().min(10, "Review must be at least 10 characters").max(1000),
});

// ============================================
// Profile schemas
// ============================================

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string().max(50)).max(20).optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  phone: phoneSchema.optional(),
});

// ============================================
// Password reset schemas
// ============================================

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ============================================
// Utility function for API validation
// ============================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodIssue[] };

export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

export function formatZodErrors(issues: z.ZodIssue[]): string {
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
}

// ============================================
// Desktop app schemas (полностью отдельные от сайта)
// ============================================

const individualFields = z.object({
  userType: z.literal("individual"),
  firstName: z.string().min(1, "firstName is required"),
  lastName: z.string().min(1, "lastName is required"),
  personalNumber: z.string().regex(/^\d{11}$/, "personalNumber must be 11 digits"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be YYYY-MM-DD"),
});

const companyFields = z.object({
  userType: z.literal("company"),
  companyName: z.string().min(1, "companyName is required"),
  companyIdCode: z.string().regex(/^\d{9}$/, "companyIdCode must be 9 digits"),
});

const commonRegisterFields = z.object({
  phone: z.string().min(4, "phone is required"),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const desktopRegisterIndividualSchema = individualFields.merge(commonRegisterFields);
export const desktopRegisterCompanySchema = companyFields.merge(commonRegisterFields);

export const desktopLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const desktopRefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const quotaReserveSchema = z.object({
  count: z.number().int().min(1).max(100_000),
  idempotency_key: z.string().min(1).max(128).optional(),
});

export const quotaReportSchema = z.object({
  quota_id: z.string().min(1, "Quota ID is required"),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  idempotency_key: z.string().min(1).max(128).optional(),
});

export const adminTopupSchema = z.object({
  email: emailSchema,
  amount: z.number().int().min(1, "Amount must be positive"),
  reason: z.string().min(1).max(300).optional(),
  externalPaymentId: z.string().min(1).max(200).optional(),
});

export const billingLedgerTypeSchema = z.enum([
  "TOPUP",
  "QUOTA_RESERVE",
  "QUOTA_REFUND",
  "ADJUSTMENT",
  "PAYMENT_CAPTURE",
  "PAYMENT_REFUND",
]);

export const listBillingLedgerSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: billingLedgerTypeSchema.optional(),
});

export const desktopPaymentStatusSchema = z.enum([
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
]);

export const listDesktopPaymentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: desktopPaymentStatusSchema.optional(),
});

// ============================================
// Campaign schemas
// ============================================

export const campaignStatusSchema = z.enum([
  "DRAFT",
  "QUEUED",
  "SENDING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
]);

export const campaignScheduleModeSchema = z.enum(["ONCE", "DAILY"]);
export const campaignPreflightStatusSchema = z.enum(["GOOD", "WARNING", "CRITICAL"]);

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(200),
  subject: z.string().min(1, "Subject is required").max(998),
  previewText: z.string().max(255).optional(),
  senderName: z.string().max(200).optional(),
  senderEmail: z.string().email("Invalid sender email").optional(),
  html: z.string().min(1, "HTML body is required"),
  contactListId: z.string().min(1).optional(),
  preflight: z.object({
    status: campaignPreflightStatusSchema,
    recommendations: z.array(z.string().min(1).max(300)).max(5),
    checkedAt: z.string().datetime(),
  }).optional(),
  scheduleMode: campaignScheduleModeSchema.default("ONCE"),
  scheduledAt: z.string().datetime().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(1_000_000).optional(),
  dailySendTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "dailySendTime must be HH:MM")
    .optional(),
}).superRefine((data, ctx) => {
  if (data.scheduleMode === "DAILY" && !data.dailyLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dailyLimit"],
      message: "dailyLimit is required for DAILY schedule mode",
    });
  }
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(998).optional(),
  previewText: z.string().max(255).nullable().optional(),
  senderName: z.string().max(200).nullable().optional(),
  senderEmail: z.string().email("Invalid sender email").nullable().optional(),
  html: z.string().min(1).optional(),
  scheduleMode: campaignScheduleModeSchema.optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  dailySendTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "dailySendTime must be HH:MM")
    .nullable()
    .optional(),
});

export const listCampaignsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: campaignStatusSchema.optional(),
  campaignId: z.string().min(1).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD")
    .optional(),
});

export const assignContactListSchema = z.object({
  contactListId: z.string().min(1, "Contact list ID is required"),
});

export const mergeContactListsSchema = z.object({
  listIds: z.array(z.string().min(1)).min(1).max(25),
  name: z.string().min(1).max(200).optional(),
});

export const campaignPreflightRequestSchema = z.object({
  senderEmail: z.string().email("Invalid sender email").optional(),
  subject: z.string().min(1).max(998),
  previewText: z.string().max(255).optional(),
  html: z.string().min(1).max(1_000_000),
  recipientsCount: z.coerce.number().int().min(0),
});

export const listCampaignFailedRecipientsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  format: z.enum(["json", "csv"]).default("json"),
});

export const retryCampaignFailedSchema = z.object({
  newCampaignName: z.string().min(1).max(200).optional(),
  createNewList: z.boolean().default(true),
});

export const createCampaignTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(200),
  category: z.string().min(1).max(100).default("custom"),
  subject: z.string().min(1, "Template subject is required").max(998),
  html: z.string().min(1, "Template body is required"),
  description: z.string().max(1000).optional(),
});

export const updateCampaignTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(998).optional(),
  html: z.string().min(1).optional(),
  description: z.string().max(1000).nullable().optional(),
});

export const listCampaignTemplatesSchema = z.object({
  category: z.string().min(1).max(100).optional(),
});

// ============================================
// Desktop SMTP config schemas
// ============================================

export const upsertDesktopSmtpConfigSchema = z.object({
  host: z.string().min(1, "SMTP host is required").max(255),
  port: z.coerce.number().int().min(1).max(65535).default(465),
  secure: z.boolean().optional(),
  username: z.string().min(1, "SMTP username is required").max(255),
  password: z.string().min(1, "SMTP password is required").max(1000).optional(),
  fromEmail: z.string().email("Invalid from email").nullable().optional(),
  fromName: z.string().max(200).nullable().optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
});

export const createDesktopSmtpPoolAccountSchema = z.object({
  host: z.string().min(1, "SMTP host is required").max(255),
  port: z.coerce.number().int().min(1).max(65535).default(465),
  secure: z.boolean().optional(),
  username: z.string().min(1, "SMTP username is required").max(255),
  password: z.string().min(1, "SMTP password is required").max(1000),
  fromEmail: z.string().email("Invalid from email").nullable().optional(),
  fromName: z.string().max(200).nullable().optional(),
  proxyType: z.string().max(32).nullable().optional(),
  proxyHost: z.string().max(255).nullable().optional(),
  proxyPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  proxyUsername: z.string().max(255).nullable().optional(),
  proxyPassword: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
  priority: z.coerce.number().int().min(-1000).max(1000).optional(),
});

export const updateDesktopSmtpPoolAccountSchema = z.object({
  host: z.string().min(1).max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(1000).optional(),
  fromEmail: z.string().email("Invalid from email").nullable().optional(),
  fromName: z.string().max(200).nullable().optional(),
  proxyType: z.string().max(32).nullable().optional(),
  proxyHost: z.string().max(255).nullable().optional(),
  proxyPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  proxyUsername: z.string().max(255).nullable().optional(),
  proxyPassword: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
  priority: z.coerce.number().int().min(-1000).max(1000).optional(),
});

export const testDesktopSmtpPoolConnectionSchema = z.object({
  accountId: z.string().cuid().optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.accountId) return;
  if (!data.host) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["host"],
      message: "SMTP host is required",
    });
  }
  if (!data.port) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["port"],
      message: "SMTP port is required",
    });
  }
  if (!data.username) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["username"],
      message: "SMTP username is required",
    });
  }
  if (!data.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "SMTP password is required",
    });
  }
});

export const mailerSpamCheckSchema = z.object({
  subject: z.string().max(998).default(""),
  html: z.string().max(1_000_000).default(""),
});

export const mailerDeliverabilitySchema = z.object({
  senderEmail: z.string().email("Invalid sender email").optional(),
  domain: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .optional(),
  dkimSelectors: z.array(z.string().min(1).max(64)).max(20).optional(),
});

export const mailerBounceScanSchema = z.object({
  mailbox: z.string().min(1).max(255).default("INBOX"),
  maxMessages: z.coerce.number().int().min(1).max(500).default(100),
  markAsSeen: z.boolean().default(true),
});

// ============================================
// Contact list schemas
// ============================================

export const createContactListSchema = z.object({
  name: z.string().min(1, "List name is required").max(200),
});

export const listContactListsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listContactsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
