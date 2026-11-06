import { eq } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { businesses } from "../models/postgres/index.js";
import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";

// ─── Gemini SDK: use whatever is installed ───────────────────
let ai;
try {
  const mod = await import("@google/genai");
  ai = new mod.GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
} catch {
  const mod = await import("@google/generative-ai");
  ai = new mod.GoogleGenerativeAI(env.GEMINI_API_KEY);
}
export { ai };

const MODEL = "gemini-3.8-flash";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Pure helpers ────────────────────────────────────────────
export function hasMinimumData(business = {}) {
  return (
    typeof business.description === "string" &&
    business.description.length >= 100 &&
    !!business.sector
  );
}

export function computeMissing(business = {}) {
  const missing = [];
  const desc = business.description || "";
  if (desc.length < 100) missing.push("Detailed description");
  if (!business.fundingAsk) missing.push("Funding ask");
  if (business.verificationTier !== "verified") {
    missing.push("Verified registration documents");
  }
  return missing;
}

// ─── Prompt ──────────────────────────────────────────────────
function buildPrompt(business, missing) {
  const dataBlock = [
    `Company name: ${business.companyName || "Unknown"}`,
    `Sector: ${business.sector || "Unknown"}`,
    `City: ${business.city || "Unknown"}`,
    `Description: ${business.description || "Not provided"}`,
    `Tagline: ${business.tagline || "Not provided"}`,
    `Business model: ${business.businessModel || "Not provided"}`,
    `Employee count: ${business.employeeCount ?? "Not provided"}`,
    `Funding ask: ${business.fundingAsk ?? "Not provided"}`,
    `Funding instrument: ${business.fundingInstrument || "Not provided"}`,
    `Revenue range: ${business.revenueRange || "Not provided"}`,
    `Verification tier: ${business.verificationTier || "unverified"}`,
  ].join("\n");

  return [
    "You are generating a one-page investor brief for the following business.",
    "",
    dataBlock,
    "",
    "Rules:",
    "- Only use facts present in the data above. Never invent.",
    `- Do not write about any of these missing fields: ${missing.length ? missing.join(", ") : "none"}.`,
    "- Respond with valid JSON matching this schema exactly:",
    '  { "headline": string, "what_they_do": string, "traction": string, "the_ask": string, "risks": string[] }',
  ].join("\n");
}

// Handles every shape the test mock or the real SDK might produce.
function extractText(response) {
  if (response == null) throw new Error("Empty Gemini response");

  const accessors = [
    () => response.text,
    () => response.response?.text,
  ];

  for (const get of accessors) {
    let value;
    try {
      value = get();
    } catch {
      continue;
    }
    if (value == null) continue;
    if (typeof value === "function") {
      try {
        const out = value();
        if (typeof out === "string") return out;
      } catch {
        continue;
      }
    } else if (typeof value === "string") {
      return value;
    }
  }

  const partsCandidates = [
    response.candidates?.[0]?.content?.parts,
    response.response?.candidates?.[0]?.content?.parts,
  ];

  for (const parts of partsCandidates) {
    if (!Array.isArray(parts)) continue;
    const joined = parts
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .join("");
    if (joined) return joined;
  }

  throw new Error("Cannot extract text from Gemini response: unknown shape");
}

// ─── Cache ───────────────────────────────────────────────────
function isCacheFresh(business) {
  if (!business.investorBrief) return false;
  if (!business.investorBriefGeneratedAt) return false;
  const ts = new Date(business.investorBriefGeneratedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

// ─── Generate ────────────────────────────────────────────────
// ─── Generate ────────────────────────────────────────────────
export async function generateBrief(businessId) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return { status: "error", error: "not_found" };
  }

  // Weaker gate than hasMinimumData: only bail when there is truly nothing
  // to write about. hasMinimumData (description >= 100 AND sector) remains
  // the "can we generate a GOOD brief" check for UI use.
  const hasSomething =
    (business.description && business.description.trim() !== "") ||
    !!business.sector ||
    (Array.isArray(business.keyProducts) && business.keyProducts.length > 0);

  if (!hasSomething) {
    return { status: "error", error: "insufficient_data" };
  }

  const missing = computeMissing(business);
  const prompt = buildPrompt(business, missing);

  try {
    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      { attempts: 3 }
    );

    const raw = extractText(response);
    const brief = JSON.parse(raw);
    brief.whatsMissing = missing;

    await db
      .update(businesses)
      .set({
        investorBrief: brief,
        investorBriefGeneratedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));

    return { status: "ok", brief };
  } catch (err) {
    return {
      status: "error",
      error: "generation_failed",
      detail: err.message,
    };
  }
}

// ─── Read (cached or generate) ───────────────────────────────
export async function getBrief(businessId, { forceRegenerate = false } = {}) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return { status: "error", error: "not_found" };
  }

  if (!forceRegenerate && isCacheFresh(business)) {
    return { status: "ok", brief: business.investorBrief, cached: true };
  }

  return generateBrief(businessId);
}