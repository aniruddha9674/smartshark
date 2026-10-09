import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { withRetry, isTransientError } from "../utils/retry.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.8-flash";

const DOCUMENT_SPECS = {
  udyam: {
    label: "Udyam Registration Certificate",
    fields: [
      { name: "enterprise_name", type: "string", description: "Registered name of the enterprise" },
      { name: "udyam_registration_number", type: "string", description: "UDYAM-XX-00-0000000 format" },
      { name: "type_of_enterprise", type: "enum:Micro|Small|Medium", description: "Enterprise size class" },
      { name: "major_activity", type: "enum:Manufacturing|Service", description: "Primary activity" },
      { name: "date_of_incorporation", type: "date (YYYY-MM-DD)", description: "Date of enterprise registration" },
      { name: "plant_address", type: "string", description: "Full address of the enterprise" },
    ],
  },
  gst: {
    label: "GST Registration Certificate",
    fields: [
      { name: "legal_name", type: "string", description: "Legal name of the business" },
      { name: "trade_name", type: "string", description: "Trade name if different from legal name" },
      { name: "gstin", type: "string", description: "15-character GSTIN" },
      { name: "principal_place_of_business", type: "string", description: "Primary business address" },
      { name: "date_of_liability", type: "date (YYYY-MM-DD)", description: "GST liability start date" },
      { name: "constitution_of_business", type: "string", description: "e.g., Proprietorship, Private Limited" },
    ],
  },
  shop_act: {
    label: "Shop and Establishment Act License",
    fields: [
      { name: "establishment_name", type: "string", description: "Name of the establishment" },
      { name: "employer_name", type: "string", description: "Name of the employer/owner" },
      { name: "certificate_number", type: "string", description: "License/certificate number" },
      { name: "address_of_establishment", type: "string", description: "Full establishment address" },
      { name: "date_of_registration", type: "date (YYYY-MM-DD)", description: "Registration date" },
    ],
  },
};

const buildPrompt = (documentType) => {
  const spec = DOCUMENT_SPECS[documentType];
  const fieldLines = spec.fields
    .map((f) => `  "${f.name}": { "value": <${f.type} or null>, "confidence": <0-1> }  // ${f.description}`)
    .join("\n");

  return `You are extracting structured data from an Indian business document.

Document type: ${spec.label}

Return STRICT JSON with exactly these fields:
{
${fieldLines}
}

Rules:
- If the image is not a ${spec.label}, return: { "error": "wrong_document" }
- If a field is unreadable or missing, set "value" to null and "confidence" to 0
- Confidence is your certainty the value is correct (0 = no idea, 1 = certain)
- Never invent values. If unsure, use null.
- Return ONLY the JSON object, no prose, no markdown fences.`;
};

const fetchImageAsBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { base64: buffer.toString("base64"), mimeType: contentType };
};

export const extractFromDocument = async (documentUrl, documentType) => {
  const spec = DOCUMENT_SPECS[documentType];
  if (!spec) throw new Error(`Unsupported document type: ${documentType}`);

  const { base64, mimeType } = await fetchImageAsBase64(documentUrl);
  const prompt = buildPrompt(documentType);

  checkRateLimit("gemini", 14, 60_000);

  const text = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          { inlineData: { mimeType, data: base64 } },
          prompt,
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      return response.text;
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
    throw new Error("Gemini returned invalid JSON");
  }

  if (parsed.error === "wrong_document") {
    return { fields: {}, overallConfidence: 0, raw: text, wrongDocument: true };
  }

  const values = Object.values(parsed).filter(
    (f) => f && typeof f.confidence === "number"
  );
  const overallConfidence =
    values.length > 0
      ? values.reduce((sum, f) => sum + f.confidence, 0) / values.length
      : 0;

  return {
    fields: parsed,
    overallConfidence: Number(overallConfidence.toFixed(3)),
    raw: text,
    wrongDocument: false,
  };
};

export { DOCUMENT_SPECS };