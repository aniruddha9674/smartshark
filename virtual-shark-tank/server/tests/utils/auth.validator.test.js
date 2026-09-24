import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
} from "../../src/validators/auth.validator.js";

describe("registerSchema", () => {
  const valid = {
    name: "Alice Sharma",
    email: "alice@example.com",
    password: "Password123",
  };

  it("accepts a valid payload", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("lowercases the email", () => {
    const result = registerSchema.safeParse({
      ...valid,
      email: "ALICE@EXAMPLE.COM",
    });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("alice@example.com");
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "Pass1" }).success).toBe(false);
  });

  it("rejects a password without an uppercase letter", () => {
    expect(registerSchema.safeParse({ ...valid, password: "password123" }).success).toBe(false);
  });

  it("rejects a password without a lowercase letter", () => {
    expect(registerSchema.safeParse({ ...valid, password: "PASSWORD123" }).success).toBe(false);
  });

  it("rejects a password without a number", () => {
    expect(registerSchema.safeParse({ ...valid, password: "PasswordABC" }).success).toBe(false);
  });

  it("rejects when required fields are missing", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
    expect(registerSchema.safeParse({ email: valid.email }).success).toBe(false);
    expect(registerSchema.safeParse({ email: valid.email, password: valid.password }).success).toBe(false);
  });

  it("strips unknown extra fields (no privilege escalation via body)", () => {
    const result = registerSchema.safeParse({
      ...valid,
      isAdmin: true,        // attacker attempt
      isVerified: true,
      role: "admin",        // removed field — should be stripped
    });
    expect(result.success).toBe(true);
    expect(result.data.isAdmin).toBeUndefined();
    expect(result.data.isVerified).toBeUndefined();
    expect(result.data.role).toBeUndefined();
  });
});

describe("loginSchema", () => {
  const valid = {
    email: "alice@example.com",
    password: "Password123",
  };

  it("accepts a valid payload", () => {
    expect(loginSchema.safeParse(valid).success).toBe(true);
  });

  it("lowercases the email", () => {
    const result = loginSchema.safeParse({ ...valid, email: "ALICE@EXAMPLE.COM" });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("alice@example.com");
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ ...valid, email: "bad" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ ...valid, password: "" }).success).toBe(false);
  });
});