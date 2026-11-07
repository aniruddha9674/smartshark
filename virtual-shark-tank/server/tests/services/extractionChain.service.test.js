import { describe, it, expect } from "vitest";
import {
  extractJsonLd,
  extractMetaTags,
  extractCssRules,
  extractFromHtml,
  toDraftShape,
} from "../../src/services/extractionChain.service.js";

const jsonLdScript = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("extractionChain.service", () => {
  describe("extractJsonLd", () => {
    it("extracts a basic Organization", () => {
      const html = jsonLdScript({
        "@type": "Organization",
        name: "Acme Ltd",
        description: "We build billing software for Indian SMBs, based in Pune.",
        slogan: "Billing made simple",
        sameAs: ["https://linkedin.com/company/acme", "https://twitter.com/acme"],
      });
      const out = extractJsonLd(html);
      expect(out.companyName).toBe("Acme Ltd");
      expect(out.description).toMatch(/billing software/);
      expect(out.tagline).toBe("Billing made simple");
      expect(out.linkedinUrl).toBe("https://linkedin.com/company/acme");
      expect(out.twitterUrl).toBe("https://twitter.com/acme");
    });

    it("handles @graph wrapper", () => {
      const html = jsonLdScript({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: "ignored" },
          { "@type": "Organization", name: "Graph Org" },
        ],
      });
      expect(extractJsonLd(html).companyName).toBe("Graph Org");
    });

    it("handles array-valued @type", () => {
      const html = jsonLdScript({
        "@type": ["Organization", "LocalBusiness"],
        name: "Array Org",
      });
      expect(extractJsonLd(html).companyName).toBe("Array Org");
    });

    it("skips malformed JSON", () => {
      const html = `<script type="application/ld+json">{broken json</script>` +
        jsonLdScript({ "@type": "Organization", name: "Good Org" });
      expect(extractJsonLd(html).companyName).toBe("Good Org");
    });

    it("returns {} when no Organization node", () => {
      const html = jsonLdScript({ "@type": "Product", name: "Widget" });
      expect(extractJsonLd(html)).toEqual({});
    });

    it("rejects descriptions under 60 chars", () => {
      const html = jsonLdScript({
        "@type": "Organization",
        name: "X",
        description: "short",
      });
      expect(extractJsonLd(html).description).toBeUndefined();
    });
  });

  describe("extractMetaTags", () => {
    it("extracts og:description and og:title", () => {
      const html = `
        <meta property="og:description" content="${"A".repeat(120)}" />
        <meta property="og:title" content="My Tagline" />
      `;
      const out = extractMetaTags(html);
      expect(out.description).toHaveLength(120);
      expect(out.tagline).toBe("My Tagline");
    });

    it("falls back to name=description", () => {
      const html = `<meta name="description" content="${"B".repeat(120)}" />`;
      expect(extractMetaTags(html).description).toHaveLength(120);
    });

    it("returns {} when no relevant meta tags", () => {
      expect(extractMetaTags("<html></html>")).toEqual({});
    });
  });

  describe("extractCssRules", () => {
    it("extracts title as tagline", () => {
      const html = `<title>My Company Home</title>`;
      expect(extractCssRules(html).tagline).toBe("My Company Home");
    });

    it("extracts first long paragraph as description", () => {
      const long = "A".repeat(120);
      const html = `<p>short</p><p>${long}</p>`;
      expect(extractCssRules(html).description).toBe(long);
    });

    it("returns {} on empty HTML", () => {
      expect(extractCssRules("")).toEqual({});
    });
  });

  describe("extractFromHtml", () => {
    it("merges with json_ld > meta > css priority", () => {
      const html =
        jsonLdScript({ "@type": "Organization", name: "JL Org", slogan: "JL tagline" }) +
        `<meta property="og:title" content="Meta tagline" />` +
        `<title>CSS tagline</title>`;
      const out = extractFromHtml(html);
      expect(out.fields.tagline).toBe("JL tagline");
      expect(out.methods.tagline).toBe("json_ld");
    });

    it("fills gaps from lower-priority sources", () => {
      const html =
        jsonLdScript({ "@type": "Organization", name: "JL Org" }) +
        `<meta property="og:title" content="Meta tagline" />`;
      const out = extractFromHtml(html);
      expect(out.methods.companyName).toBe("json_ld");
      expect(out.methods.tagline).toBe("meta_tags");
    });
  });

  describe("toDraftShape", () => {
    it("shapes fields with method-derived confidence", () => {
      const extracted = {
        fields: { companyName: "X", tagline: "Y" },
        methods: { companyName: "json_ld", tagline: "meta_tags" },
      };
      const out = toDraftShape(extracted);
      expect(out.companyName.confidence).toBe(0.95);
      expect(out.companyName.source).toBe("json_ld");
      expect(out.tagline.confidence).toBe(0.75);
      expect(out.tagline.source).toBe("meta_tags");
    });

    it("returns {} for empty input", () => {
      expect(toDraftShape({ fields: {}, methods: {} })).toEqual({});
    });
  });
});