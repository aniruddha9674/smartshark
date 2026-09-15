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
    role: "investor",
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
    const result = registerSchema.safeParse({ ...valid, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "Pass1" });
    expect(result.success).toBe(false);
  });

  it("rejects a password without an uppercase letter", () => {
    const result = registerSchema.safeParse({ ...valid, password: "password123" });
    expect(result.success).toBe(false);
  });

  it("rejects a password without a lowercase letter", () => {
    const result = registerSchema.safeParse({ ...valid, password: "PASSWORD123" });
    expect(result.success).toBe(false);
  });

  it("rejects a password without a number", () => {
    const result = registerSchema.safeParse({ ...valid, password: "PasswordABC" });
    expect(result.success).toBe(false);
  });

  it("rejects role 'admin' (no self-signup as admin)", () => {
    const result = registerSchema.safeParse({ ...valid, role: "admin" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = registerSchema.safeParse({ ...valid, role: "superuser" });
    expect(result.success).toBe(false);
  });

  it("accepts role 'business'", () => {
    const result = registerSchema.safeParse({ ...valid, role: "business" });
    expect(result.success).toBe(true);
  });

  it("rejects when required fields are missing", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
    expect(registerSchema.safeParse({ email: valid.email }).success).toBe(false);
    expect(registerSchema.safeParse({ email: valid.email, password: valid.password }).success).toBe(false);
  });

  it("strips unknown extra fields (no privilege escalation via body)", () => {
    const result = registerSchema.safeParse({
      ...valid,
      isVerified: true,       // attacker attempt
      isActive: true,
      role: "investor",       // overwrite with valid role
    });
    expect(result.success).toBe(true);
    expect(result.data.isVerified).toBeUndefined();
    expect(result.data.isActive).toBeUndefined();
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

  it("does not enforce password complexity (that's register's job)", () => {
    // Login must accept whatever was set at register time, even if rules changed.
    const result = loginSchema.safeParse({ ...valid, password: "old" });
    expect(result.success).toBe(true);
  });
});