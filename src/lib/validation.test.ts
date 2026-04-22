import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  personalIdSchema,
  birthDateSchema,
  createProjectSchema,
  createProposalSchema,
  createMessageSchema,
  createReviewSchema,
  validate,
  formatZodErrors,
} from "./validation";

describe("emailSchema", () => {
  it("should accept valid email", () => {
    const result = emailSchema.safeParse("Test@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("test@example.com");
    }
  });

  it("should reject invalid email", () => {
    const result = emailSchema.safeParse("invalid-email");
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("should accept password with 8+ characters", () => {
    const result = passwordSchema.safeParse("password123");
    expect(result.success).toBe(true);
  });

  it("should reject short password", () => {
    const result = passwordSchema.safeParse("short");
    expect(result.success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("should accept valid Georgian phone", () => {
    const result = phoneSchema.safeParse("+995 555 12 34 56");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("+995555123456");
    }
  });

  it("should reject too short phone", () => {
    const result = phoneSchema.safeParse("12345");
    expect(result.success).toBe(false);
  });
});

describe("personalIdSchema", () => {
  it("should accept 11-digit ID", () => {
    const result = personalIdSchema.safeParse("01234567890");
    expect(result.success).toBe(true);
  });

  it("should clean and validate ID with spaces", () => {
    const result = personalIdSchema.safeParse("012 345 678 90");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("01234567890");
    }
  });

  it("should reject wrong length ID", () => {
    const result = personalIdSchema.safeParse("1234567");
    expect(result.success).toBe(false);
  });
});

describe("birthDateSchema", () => {
  it("should accept valid date", () => {
    const result = birthDateSchema.safeParse("1990-05-15");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(Date);
    }
  });

  it("should reject future date", () => {
    const result = birthDateSchema.safeParse("2030-01-01");
    expect(result.success).toBe(false);
  });

  it("should reject invalid format", () => {
    const result = birthDateSchema.safeParse("15/05/1990");
    expect(result.success).toBe(false);
  });
});

describe("createProjectSchema", () => {
  it("should accept valid project", () => {
    const result = createProjectSchema.safeParse({
      title: "Build a website",
      description: "I need a professional website for my business with modern design",
      category: "web_development",
      budget: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("should reject short title", () => {
    const result = createProjectSchema.safeParse({
      title: "Hi",
      description: "I need a professional website for my business with modern design",
      category: "web_development",
      budget: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid category", () => {
    const result = createProjectSchema.safeParse({
      title: "Build a website",
      description: "I need a professional website for my business with modern design",
      category: "invalid_category",
      budget: 5000,
    });
    expect(result.success).toBe(false);
  });
});

describe("createProposalSchema", () => {
  it("should accept valid proposal", () => {
    const result = createProposalSchema.safeParse({
      projectId: "cuid1234567890123456789012",
      coverLetter: "I am very interested in this project. ".repeat(3),
      proposedBudget: 4500,
      estimatedDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it("should reject short cover letter", () => {
    const result = createProposalSchema.safeParse({
      projectId: "cuid1234567890123456789012",
      coverLetter: "Short",
      proposedBudget: 4500,
      estimatedDays: 30,
    });
    expect(result.success).toBe(false);
  });
});

describe("createMessageSchema", () => {
  it("should accept valid message", () => {
    const result = createMessageSchema.safeParse({
      content: "Hello, I have a question about the project.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty message", () => {
    const result = createMessageSchema.safeParse({
      content: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("createReviewSchema", () => {
  it("should accept valid review", () => {
    const result = createReviewSchema.safeParse({
      projectId: "cuid1234567890123456789012",
      rating: 5,
      comment: "Excellent work! Very professional and delivered on time.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid rating", () => {
    const result = createReviewSchema.safeParse({
      projectId: "cuid1234567890123456789012",
      rating: 10,
      comment: "Excellent work! Very professional and delivered on time.",
    });
    expect(result.success).toBe(false);
  });
});

describe("validate utility", () => {
  it("should return success with data", () => {
    const result = validate(emailSchema, "test@example.com");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("test@example.com");
    }
  });

  it("should return errors on failure", () => {
    const result = validate(emailSchema, "invalid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("formatZodErrors", () => {
  it("should format errors nicely", () => {
    const result = createProjectSchema.safeParse({
      title: "Hi",
      description: "Short",
      category: "invalid",
      budget: -100,
    });
    
    if (!result.success) {
      const formatted = formatZodErrors(result.error.issues);
      expect(formatted).toContain("title");
      expect(formatted).toContain("description");
    }
  });
});
