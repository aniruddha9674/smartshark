export function normalizeUrl(raw) { /* existing */ }
export function isBlockedIPv4(ip) { /* existing */ }
export function isBlockedIPv6(ip) { /* existing */ }

import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  isBlockedIPv4,
  isBlockedIPv6,
  extractReadableText,
  fetchSafe,
} from "../../src/services/websiteScrape.service.js";

describe("websiteScrape.service", () => {
  describe("normalizeUrl", () => {
    it("prepends https:// to scheme-less domain", () => {
      expect(normalizeUrl("infosys.com")).toBe("https://infosys.com");
    });

    it("preserves existing https", () => {
      expect(normalizeUrl("https://example.com/a")).toBe("https://example.com/a");
    });

    it("preserves existing http", () => {
      expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    });

    it("rejects ftp://", () => {
      expect(() => normalizeUrl("ftp://example.com")).toThrow(/Unsupported URL scheme/);
    });

    it("rejects javascript:", () => {
      expect(() => normalizeUrl("javascript:alert(1)")).toThrow(/Unsupported URL scheme/);
    });

    it("rejects file://", () => {
      expect(() => normalizeUrl("file:///etc/passwd")).toThrow(/Unsupported URL scheme/);
    });

    it("throws on empty string", () => {
      expect(() => normalizeUrl("")).toThrow(/Empty URL/);
    });
  });

  describe("isBlockedIPv4", () => {
    it.each([
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "240.0.0.1",
    ])("blocks %s", (ip) => {
      expect(isBlockedIPv4(ip)).toBe(true);
    });

    it.each(["8.8.8.8", "1.1.1.1", "52.100.1.1"])("allows %s", (ip) => {
      expect(isBlockedIPv4(ip)).toBe(false);
    });
  });

  describe("isBlockedIPv6", () => {
    it.each(["::1", "fe80::1", "fc00::1", "fd00::1", "ff02::1"])(
      "blocks %s",
      (ip) => {
        expect(isBlockedIPv6(ip)).toBe(true);
      }
    );

    it("allows public IPv6", () => {
      expect(isBlockedIPv6("2606:4700:4700::1111")).toBe(false);
    });
  });

  describe("extractReadableText", () => {
    it("strips script, style, nav, footer", () => {
      const html = `
        <script>alert(1)</script>
        <style>body{}</style>
        <nav>Nav item</nav>
        <footer>Copyright</footer>
        <main>Hello world</main>
      `;
      const text = extractReadableText(html);
      expect(text).toBe("Hello world");
    });

    it("decodes HTML entities", () => {
      expect(extractReadableText("<p>A &amp; B &lt; C</p>")).toBe("A & B < C");
    });

    it("caps at 4000 chars with ellipsis", () => {
      const text = extractReadableText("A".repeat(5000));
      expect(text).toHaveLength(4001); // 4000 + "…"
      expect(text.endsWith("…")).toBe(true);
    });
  });

  describe("fetchSafe (SSRF guard)", () => {
    it("rejects file:// scheme", async () => {
      await expect(fetchSafe("file:///etc/passwd")).rejects.toThrow(/Unsupported URL scheme/);
    });

    it("rejects javascript: scheme", async () => {
      await expect(fetchSafe("javascript:alert(1)")).rejects.toThrow(/Unsupported URL scheme/);
    });
  });
});