/**
 * Format validators for Indian business identifiers.
 * Each validator returns { valid: boolean, reason: string | null }.
 *
 * These are pure functions — no DB, no network. Testable in isolation.
 */

// ─── GSTIN ─────────────────────────────────────────────────────
// Format: 15 chars. [2-digit state][10-char PAN][1 entity][Z][checksum]
// Checksum: mod 36 over alternating position weights.

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const gstinChecksum = (gstin14) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(gstin14[i]);
    if (value === -1) return null;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const remainder = sum % 36;
  const checksumValue = (36 - remainder) % 36;
  return GSTIN_CHARS[checksumValue];
};

export const validateGSTIN = (value) => {
  if (!value || typeof value !== "string") {
    return { valid: false, reason: "empty" };
  }

  const normalized = value.toUpperCase().replace(/\s/g, "");

  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalized)) {
    return { valid: false, reason: "format" };
  }

  const stateCode = parseInt(normalized.slice(0, 2), 10);
  if (stateCode < 1 || stateCode > 37) {
    return { valid: false, reason: "invalid_state_code" };
  }

  const expected = gstinChecksum(normalized.slice(0, 14));
  if (expected !== normalized[14]) {
    return { valid: false, reason: "checksum_mismatch" };
  }

  return { valid: true, reason: null };
};

// ─── Udyam Registration ────────────────────────────────────────
// Format: UDYAM-XX-00-0000000

const UDYAM_STATE_CODES = new Set([
  "AN", "AP", "AR", "AS", "BR", "CH", "CT", "DD", "DL", "DN",
  "GA", "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD",
  "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ",
  "SK", "TN", "TR", "TS", "UK", "UP", "WB",
]);

export const validateUdyam = (value) => {
  if (!value || typeof value !== "string") {
    return { valid: false, reason: "empty" };
  }

  const normalized = value.toUpperCase().replace(/\s/g, "");

  if (!/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(normalized)) {
    return { valid: false, reason: "format" };
  }

  const stateCode = normalized.slice(6, 8);
  if (!UDYAM_STATE_CODES.has(stateCode)) {
    return { valid: false, reason: "invalid_state_code" };
  }

  return { valid: true, reason: null };
};

// ─── PAN ───────────────────────────────────────────────────────
// Format: AAAAA0000A

const PAN_HOLDER_TYPES = new Set(["P", "C", "H", "F", "A", "T", "B", "L", "J", "G"]);

export const validatePAN = (value) => {
  if (!value || typeof value !== "string") {
    return { valid: false, reason: "empty" };
  }

  const normalized = value.toUpperCase().replace(/\s/g, "");

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized)) {
    return { valid: false, reason: "format" };
  }

  const holderType = normalized[3];
  if (!PAN_HOLDER_TYPES.has(holderType)) {
    return { valid: false, reason: "invalid_holder_type" };
  }

  return { valid: true, reason: null };
};

// ─── Shop Act License ──────────────────────────────────────────

export const validateShopAct = (value) => {
  if (!value || typeof value !== "string") {
    return { valid: false, reason: "empty" };
  }

  const normalized = value.trim();

  if (normalized.length < 5 || normalized.length > 30) {
    return { valid: false, reason: "length" };
  }

  if (!/^[A-Z0-9\-\/]+$/i.test(normalized)) {
    return { valid: false, reason: "format" };
  }

  return { valid: true, reason: null };
};

// ─── Dispatcher ────────────────────────────────────────────────

const FIELD_VALIDATORS = {
  udyam_registration_number: validateUdyam,
  gstin: validateGSTIN,
  pan_number: validatePAN,
  certificate_number: validateShopAct,
};

export const hasValidator = (fieldName) => fieldName in FIELD_VALIDATORS;

export const validateField = (fieldName, value) => {
  const validator = FIELD_VALIDATORS[fieldName];
  if (!validator) return null;
  return validator(value);
};

/**
 * Annotate a batch of OCR-extracted fields with format validation results.
 * Only fields with a known validator are touched.
 */
export const annotateFields = (ocrFields) => {
  if (!ocrFields || typeof ocrFields !== "object") {
    return { annotated: {}, allValid: true, validatedCount: 0, passedCount: 0 };
  }

  const annotated = {};
  let validatedCount = 0;
  let passedCount = 0;

  for (const [fieldName, fieldData] of Object.entries(ocrFields)) {
    if (!fieldData || typeof fieldData !== "object") {
      annotated[fieldName] = fieldData;
      continue;
    }

    const result = validateField(fieldName, fieldData.value);
    if (!result) {
      annotated[fieldName] = fieldData;
      continue;
    }

    validatedCount++;
    if (result.valid) passedCount++;

    annotated[fieldName] = {
      ...fieldData,
      formatValid: result.valid,
      formatReason: result.reason,
    };
  }

  const allValid = validatedCount === 0 || passedCount === validatedCount;

  return { annotated, allValid, validatedCount, passedCount };
};