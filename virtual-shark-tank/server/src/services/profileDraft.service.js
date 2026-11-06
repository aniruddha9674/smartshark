import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { db } from "../config/db.postgres.js";
import { businesses } from "../models/postgres/index.js";
import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { scrapeWebsite } from "./websiteScrape.service.js";

export const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY ?? env.geminiApiKey,
});

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.5-flash";

const DRAFT_FIELDS = [
  "tagline", "description", "businessModel", "targetMarket",
  "sector", "keyProducts", "notableClients", "useOfFunds", "plannedMilestones",
];

function buildDraftPrompt(business, scrapedText) {
  return [
    "You are drafting a startup profile for an investor marketplace.",
    "Extract or infer fields ONLY from the company data and website text below.",
    "If a field cannot be determined, return null for its value.",
    "Never invent revenue, funding amounts, customer counts, or employee counts — those are factual and must come from the owner.",
    "",
    "## Known facts",
    `Company name: ${business.companyName || "unknown"}`,
    `CIN: ${business.cin || "unknown"}`,
    `Sector (MCA): ${business.industrialClassification || business.sector || "unknown"}`,
    `State: ${business.state || "unknown"}`,
    `Incorporated: ${business.incorporationDate || "unknown"}`,
    "",
    "## Website content",
    scrapedText || "(no website provided)",
    "",
    "## Output",
    "Respond with a single JSON object. Each key is one of:",
    DRAFT_FIELDS.join(", "),
    'Each value is: { "value": <string|array|null>, "confidence": <0.0-1.0> }',
    "For array fields (keyProducts, notableClients): return array of 3-5 short strings.",
    "For useOfFunds: return array of { category, pct, description }, pct must sum to 100.",
    "For plannedMilestones: return array of { months, milestone }, 2-4 items.",
    "Confidence guidance: 0.9+ = explicit on website, 0.6-0.8 = strongly implied, <0.5 = weak guess (return null value instead).",
    "Respond with valid JSON only, no markdown fences.",
  ].join("\n");
}

// ─── Error normalization ────────────────────────────────────
// The Gemini SDK sometimes throws a raw string, sometimes an
// Error whose .message is the JSON response body. We normalize
// both into a plain Error with `.status` and `.transient` so
// withRetry / isTransientError can recognize it.

function normalizeGeminiError(raw) {
  let message = typeof raw === "string" ? raw : raw?.message || "Gemini error";
  let status = typeof raw === "object" ? raw?.status : undefined;

  if (typeof message === "string" && message.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(message);
      if (parsed.error) {
        message = parsed.error.message || message;
        status = status ?? parsed.error.code;
      }
    } catch {
      // leave message as-is if not parseable JSON
    }
  }

  const err = new Error(message);
  err.status = status;
  err.transient =
    status === 503 ||
    status === 429 ||
    /UNAVAILABLE|high demand|overloaded|timeout/i.test(message);
  return err;
}

// ─── LLM call ───────────────────────────────────────────────

async function callGemini(prompt, model) {
  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });
  } catch (err) {
    throw normalizeGeminiError(err);
  }

  const raw =
    typeof response.text === "function" ? response.text() : response.text;
  if (!raw) throw normalizeGeminiError("Empty response from Gemini");

  // Error body can arrive as text when the SDK swallows the HTTP failure
  if (raw.trim().startsWith('{"error"')) {
    throw normalizeGeminiError(raw);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw normalizeGeminiError("Gemini returned non-JSON text");
  }
}

// Primary with 3 retries; on persistent transient failure, fall back.
// This mirrors database.md §14's recommendation for the investor brief
// gap: "Retry or fall back to gemini-3.5-flash."
async function callGeminiWithFallback(prompt) {
  try {
    return await withRetry(() => callGemini(prompt, PRIMARY_MODEL), {
      attempts: 3,
      shouldRetry: (err) => err.transient === true,
    });
  } catch (err) {
    if (!err.transient) throw err;
    console.warn(
      `[profileDraft] ${PRIMARY_MODEL} unavailable (${err.status || "?"}): ${err.message}. ` +
      `Falling back to ${FALLBACK_MODEL}.`
    );
    return withRetry(() => callGemini(prompt, FALLBACK_MODEL), {
      attempts: 2,
      shouldRetry: (e) => e.transient === true,
    });
  }
}

// ─── Validation ─────────────────────────────────────────────

const MIN_CONFIDENCE = 0.5;
const MAX_ARRAY_ITEMS = 6;

function sanitizeDrafts(raw) {
  const clean = {};
  for (const field of DRAFT_FIELDS) {
    const entry = raw[field];
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.confidence !== "number" || entry.confidence < MIN_CONFIDENCE) continue;
    if (entry.value == null) continue;

    let value = entry.value;
    if (Array.isArray(value)) {
      value = value.slice(0, MAX_ARRAY_ITEMS);
      if (value.length === 0) continue;
    }
    if (typeof value === "string" && value.trim() === "") continue;

    clean[field] = { value, confidence: entry.confidence };
  }
  return clean;
}

// ─── Main service ───────────────────────────────────────────

export async function draftProfile(businessId, { documentUrls = [], onProgress } = {}) {
  const report = (step, progress) => {
    if (onProgress) onProgress(step, progress);
  };

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) throw new Error("Business not found");

  let scrapedText = "";
  if (business.websiteUrl) {
    report("scraping", 15);
    try {
      const scraped = await scrapeWebsite(business.websiteUrl);
      scrapedText = scraped.text;
    } catch (err) {
      console.warn(
        `[profileDraft] scrape failed for ${businessId}: ${err.message}`
      );
    }
  }
  report("extracting", 35);

  report("drafting", 50);
  const prompt = buildDraftPrompt(business, scrapedText);
  const raw = await callGeminiWithFallback(prompt);

  report("validating", 85);
  const drafts = sanitizeDrafts(raw);

  report("persisting", 95);

  const draftsWithProvenance = {};
  for (const [field, { value, confidence }] of Object.entries(drafts)) {
    draftsWithProvenance[field] = {
      value,
      confidence,
      source: scrapedText ? "llm_inferred_with_scrape" : "llm_inferred_mca_only",
    };
  }

  report("complete", 100);
  return {
    drafts: draftsWithProvenance,
    fieldCount: Object.keys(draftsWithProvenance).length,
    scrapedCharCount: scrapedText.length,
  };
}