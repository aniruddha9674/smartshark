import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/utils/password.js";

describe("password utils", () => {
  it("hashes a password into a non-reversible string", async () => {
    const hash = await hashPassword("Password123");
    expect(hash).not.toBe("Password123");
    expect(hash.startsWith("$2b$")).toBe(true); // bcrypt signature
    expect(hash.length).toBeGreaterThan(50);
  });

  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("Password123");
    expect(await verifyPassword("Password123", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Password123");
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salting)", async () => {
    const h1 = await hashPassword("Password123");
    const h2 = await hashPassword("Password123");
    expect(h1).not.toBe(h2);
    // Both still verify correctly
    expect(await verifyPassword("Password123", h1)).toBe(true);
    expect(await verifyPassword("Password123", h2)).toBe(true);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("Password123");
    expect(await verifyPassword("password123", hash)).toBe(false);
  });
});