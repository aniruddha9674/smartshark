// Pure extraction from HTML. No network, no LLM.
// Returns { fields, methods } where methods tells the caller how each
// field was found: "json_ld" (high confidence), "meta_tags" (medium),
// "css_rules" (low).
//
// The orchestrator (profileDraft.service.js) decides whether to send
// the remaining unfilled fields to the LLM.

// ─── JSON-LD ──────────────────────────────────────────────

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

function flattenJsonLd(parsed) {
  // Yoast/WordPress wraps everything in @graph arrays — flatten them.
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.flatMap(flattenJsonLd);
  if (parsed["@graph"]) return flattenJsonLd(parsed["@graph"]);
  return [parsed];
}

const ORG_TYPES = new Set([
  "Organization", "Corporation", "LocalBusiness", "Store", "OnlineStore",
  "EducationalOrganization", "NGO", "MedicalBusiness",
]);

function isOrganization(node) {
  if (!node || typeof node !== "object") return false;
  const t = node["@type"];
  if (Array.isArray(t)) return t.some((x) => ORG_TYPES.has(x));
  return ORG_TYPES.has(t);
}

function addressToString(addr) {
  if (!addr) return null;
  if (typeof addr === "string") return addr.trim() || null;
  const parts = [
    addr.streetAddress, addr.addressLocality, addr.addressRegion,
    addr.postalCode, addr.addressCountry,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function extractJsonLd(html) {
  const fields = {};
  for (const raw of extractJsonLdBlocks(html)) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    for (const node of flattenJsonLd(parsed)) {
      if (!isOrganization(node)) continue;

      if (!fields.companyName && typeof node.name === "string" && node.name.trim()) {
        fields.companyName = node.name.trim();
      }
      if (!fields.description && typeof node.description === "string" && node.description.trim().length >= 30) {
        fields.description = node.description.trim();
      }
      if (!fields.tagline && typeof node.slogan === "string" && node.slogan.trim()) {
        fields.tagline = node.slogan.trim();
      }
      if (!fields.registeredAddress && node.address) {
        const addr = addressToString(node.address);
        if (addr) fields.registeredAddress = addr;
      }
      if (!fields.foundingDate && typeof node.foundingDate === "string") {
        fields.foundingDate = node.foundingDate;
      }
      if (!fields.linkedinUrl && Array.isArray(node.sameAs)) {
        const li = node.sameAs.find((u) => typeof u === "string" && /linkedin\.com/i.test(u));
        if (li) fields.linkedinUrl = li;
      }
      if (!fields.twitterUrl && Array.isArray(node.sameAs)) {
        const tw = node.sameAs.find((u) => typeof u === "string" && /(?:twitter|x)\.com/i.test(u));
        if (tw) fields.twitterUrl = tw;
      }
    }
  }
  return fields;
}

// ─── Meta tags ────────────────────────────────────────────

function getMeta(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const reReverse = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    "i"
  );
  return (html.match(re)?.[1] || html.match(reReverse)?.[1] || "").trim();
}

export function extractMetaTags(html) {
  const fields = {};
  const ogDesc = getMeta(html, "og:description");
  if (ogDesc && ogDesc.length >= 60) fields.description = ogDesc;

  const metaDesc = getMeta(html, "description");
  if (!fields.description && metaDesc && metaDesc.length >= 60) {
    fields.description = metaDesc;
  }

  const ogTitle = getMeta(html, "og:title");
  if (ogTitle) fields.tagline = ogTitle;

  return fields;
}

// ─── CSS / regex heuristics ───────────────────────────────

export function extractCssRules(html) {
  const fields = {};

  // Title tag → tagline candidate
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title && !fields.tagline) fields.tagline = title;

  // First meaningful <p> → description candidate
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  for (const p of paragraphs) {
    const text = p[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length >= 80 && text.length <= 500) {
      fields.description = text;
      break;
    }
  }
  return fields;
}

// ─── Orchestrator (still pure) ────────────────────────────

// Run the chain, stop at the first source that yields each field.
// Confidence reflects extraction certainty, not model confidence.
const FIELD_CONFIDENCE = {
  json_ld: 0.95,
  meta_tags: 0.75,
  css_rules: 0.55,
};

export function extractFromHtml(html) {
  const jsonLd = extractJsonLd(html);
  const meta = extractMetaTags(html);
  const css = extractCssRules(html);

  const merged = {};
  const methods = {};

  const sources = [
    ["json_ld", jsonLd],
    ["meta_tags", meta],
    ["css_rules", css],
  ];

  for (const [source, data] of sources) {
    for (const [field, value] of Object.entries(data)) {
      if (merged[field] != null) continue;
      if (value == null || value === "") continue;
      merged[field] = value;
      methods[field] = source;
    }
  }

  return { fields: merged, methods, confidence: FIELD_CONFIDENCE };
}

// Turn deterministic extraction into the { field: { value, confidence, source } }
// shape that the wizard's Step 4 expects (same as the LLM output).
export function toDraftShape(extracted) {
  const drafts = {};
  for (const [field, value] of Object.entries(extracted.fields)) {
    drafts[field] = {
      value,
      confidence: FIELD_CONFIDENCE[extracted.methods[field]] ?? 0.5,
      source: extracted.methods[field],
    };
  }
  return drafts;
}