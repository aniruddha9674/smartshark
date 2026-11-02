import dotenv from "dotenv";
dotenv.config();
import { GoogleGenAI } from "@google/genai";
import { db } from "../config/db.postgres.js";
import { businesses, pitches } from "../models/postgres/index.js";
import { eq, and, sql } from "drizzle-orm";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.8-flash";
const CACHE_TTL_DAYS = 7;

// Deterministic: what fields are missing from this business record
function computeMissing(b) {
  const missing = [];
  if (!b.description || b.description.length < 100) missing.push("Detailed description");
  if (!b.tagline) missing.push("Tagline");
  if (!b.business_model) missing.push("Business model");
  if (!b.target_market) missing.push("Target market");
  if (!b.funding_ask) missing.push("Funding ask");
  if (!b.revenue_range) missing.push("Revenue range");
  if (!b.customer_count) missing.push("Customer count");
  if (!b.employee_count) missing.push("Employee count");
  if (!b.website_url) missing.push("Website");
  if (!b.self_declared_risks) missing.push("Disclosed risks");
  if (b.verification_tier === "unverified") missing.push("Verified registration documents");
  return missing;
}

// Is there enough to write a meaningful brief?
function hasMinimumData(b) {
  if (!b.description || b.description.length < 50) return false;
  if (!b.sector) return false;
  return true;
}

function buildPrompt(b, pitch, readinessScore, missing) {
  const data = {
    company_name: b.company_name,
    sector: b.sector,
    city: b.city,
    state: b.state,
    company_status: b.company_status,
    incorporation_date: b.incorporation_date,
    authorized_capital: b.authorized_capital,
    listing_status: b.listing_status,
    verification_tier: b.verification_tier,
    description: b.description,
    tagline: b.tagline,
    business_model: b.business_model,
    target_market: b.target_market,
    key_products: b.key_products,
    differentiation: b.differentiation,
    employee_count: b.employee_count,
    revenue_range: b.revenue_range,
    revenue_trend_bracket: b.revenue_trend_bracket,
    customer_count: b.customer_count,
    funding_ask: b.funding_ask,
    funding_instrument: b.funding_instrument,
    use_of_funds: b.use_of_funds,
    self_declared_risks: b.self_declared_risks,
    current_readiness_score: readinessScore,
    active_pitch: pitch
      ? {
          title: pitch.title,
          tagline: pitch.tagline,
          ask_amount: pitch.ask_amount,
          equity_offered: pitch.equity_offered,
        }
      : null,
    fields_missing_from_profile: missing,
  };

  return `You are writing a one-page investor brief from structured business data.

STRICT RULES:
- Only use facts present in the data. Never invent numbers, clients, revenue, or funding.
- If a field is null or empty, do NOT include it in your text. The "fields_missing_from_profile" list tells you what's not available.
- Keep each section to 1-2 sentences maximum.
- Tone: factual, neutral, analytical. No marketing language. No superlatives.
- Do not predict outcomes ("will succeed", "poised for growth"). Describe the present state only.
- If verification_tier is "unverified", do not claim the business is verified.
- The "the_ask" section should only appear if there is a funding_ask or active_pitch.

Business data:
${JSON.stringify(data, null, 2)}

Return STRICT JSON with this exact schema:
{
  "headline": "One-line summary of the business, max 100 characters",
  "what_they_do": "1-2 sentences describing the core business",
  "traction": "1-2 sentences on revenue, customers, and growth — or null if no traction data",
  "the_ask": "1 sentence on funding ask and use of funds — or null if no ask",
  "risks": "1-2 sentences on disclosed risks and gaps — or null if none"
}`;
}

async function callGemini(prompt) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned empty response");
  return JSON.parse(text);
}

/**
 * Generate a brief for a business. Persists to DB.
 */
export async function generateBrief(businessId) {
  const [b] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!b) return { error: "not_found" };
  if (!hasMinimumData(b)) return { error: "insufficient_data" };

  // Find the live pitch if any
  const [livePitch] = await db
    .select()
    .from(pitches)
    .where(and(eq(pitches.businessId, businessId), eq(pitches.status, "live")))
    .limit(1);

  const missing = computeMissing(b);
  const prompt = buildPrompt(b, livePitch, b.current_readiness_score, missing);

  let parsed;
  try {
    parsed = await callGemini(prompt);
  } catch (err) {
    console.error("[brief] Gemini failed:", err.message);
    return { error: "generation_failed", detail: err.message };
  }

  // Merge with deterministic sections
  const brief = {
    ...parsed,
    whats_missing: missing,
    generated_at: new Date().toISOString(),
    model_version: MODEL,
  };

  await db.execute(sql`
    UPDATE businesses
    SET investor_brief = ${JSON.stringify(brief)}::jsonb,
        investor_brief_generated_at = NOW()
    WHERE id = ${businessId}
  `);

  return { brief };
}

/**
 * Get the cached brief or generate a new one.
 */
export async function getBrief(businessId, { forceRegenerate = false } = {}) {
  const [row] = await db.execute(sql`
    SELECT investor_brief, investor_brief_generated_at, company_name, sector
    FROM businesses WHERE id = ${businessId}
  `).then((r) => r.rows);

  if (!row) return { error: "not_found" };

  if (!forceRegenerate && row.investor_brief) {
    const ageDays =
      (Date.now() - new Date(row.investor_brief_generated_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (ageDays < CACHE_TTL_DAYS) {
      return { brief: row.investor_brief, cached: true };
    }
  }

  return await generateBrief(businessId);
}