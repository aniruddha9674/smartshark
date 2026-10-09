import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { withRetry, isTransientError } from "../utils/retry.js";
import { CANONICAL_FIELDS } from "../config/canonical-fields.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.8-flash";

const TRANSFORMS_REFERENCE = `
- trim: string trim
- toLower: lowercase string
- toNumber: parse to number (handles "50,000" → 50000)
- toInteger: parse to integer
- toINR: Indian currency strings → INR ("50 Lakhs" → 5000000, "2 Cr" → 20000000)
- lakhsToINR: numeric values in lakhs → INR ("50" → 5000000)
- usdToInr: USD values → INR (100000 USD → 8300000)
- toYear: extract 4-digit year from date string
- toOperatingYears: founding year → years operating ("2016" → 10)
- toBoolean: yes/no/true/false/1/0 → boolean
- normalizeCity: "Bangalore" → "bengaluru", "Bombay" → "mumbai"
- normalizeSector: "Software as a Service" → "saas", "Financial Technology" → "fintech"
`;

const buildPrompt = (unmappedColumns) => {
  const fieldLines = Object.entries(CANONICAL_FIELDS)
    .map(([name, def]) => {
      const examples = def.synonyms.slice(0, 3).join(", ");
      return `- ${name} (${def.type}): ${examples}`;
    })
    .join("\n");

  const columnLines = unmappedColumns
    .map((c, i) => {
      const preview = c.sampleValues
        .slice(0, 5)
        .map((v) => JSON.stringify(v))
        .join(", ");
      return `${i + 1}. "${c.source}" — samples: [${preview}]`;
    })
    .join("\n");

  return `You are mapping CSV columns from an Indian business dataset to a canonical schema.

Canonical fields:
${fieldLines}

Available transforms:
${TRANSFORMS_REFERENCE}

For each of the following CSV columns, determine:
1. Which canonical field it maps to (or null if no match)
2. Which transform to apply

Columns:
${columnLines}

Return STRICT JSON:
{
  "mappings": [
    {
      "source": "<exact column name from the list above>",
      "field": "<canonical field name>" | null,
      "transform": "<transform name>" | null,
      "confidence": <0-1>,
      "reasoning": "<one short sentence>"
    }
  ]
}

Rules:
- Only use canonical field names from the list. Never invent a field.
- Only use transform names from the list. Never invent a transform.
- If the column is irrelevant or ambiguous, set field to null and confidence below 0.5.
- If field is set, transform must also be set.
- Return one mapping per input column, in the same order.
- Return ONLY JSON, no prose, no markdown fences.`;
};

/**
 * Ask Gemini to map unmapped CSV columns to canonical fields.
 * One call handles all columns.
 *
 * @param {Array<{ source: string, sampleValues: any[] }>} unmappedColumns
 * @returns {Promise<Array<{ source, field, transform, confidence, reasoning }>>}
 */
export const mapUnmappedColumns = async (unmappedColumns) => {
  if (unmappedColumns.length === 0) return [];

  const prompt = buildPrompt(unmappedColumns);

  checkRateLimit("gemini", 14, 60_000);

  const text = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const out = response.text;
      if (!out) throw new Error("Gemini returned empty response");
      return out;
    },
    {
      attempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      shouldRetry: isTransientError,
    }
  );

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON for column mapping");
  }

  if (!parsed.mappings || !Array.isArray(parsed.mappings)) {
    throw new Error("Gemini response missing mappings array");
  }

  const validFields = new Set(Object.keys(CANONICAL_FIELDS));

  return parsed.mappings.map((m) => {
    const validField = m.field && validFields.has(m.field) ? m.field : null;
    const confidence =
      typeof m.confidence === "number" ? m.confidence : 0;

    return {
      source: String(m.source || ""),
      field: validField,
      transform: validField && m.transform ? String(m.transform) : null,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning: String(m.reasoning || ""),
    };
  });
};