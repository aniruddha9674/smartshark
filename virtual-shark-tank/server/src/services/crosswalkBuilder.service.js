import { CANONICAL_FIELDS } from "../config/canonical-fields.js";

const MAX_LENGTHS = {
  sector: 100,
  city: 100,
  websiteUrl: 500,
  description: 5000,
  udyamNumber: 50,
  gstNumber: 50,
  shopActLicense: 50,
};

const buildValidator = (field, def) => {
  if (field === "companyName") {
    return { required: true, minLength: 2, maxLength: 255 };
  }

  const base = { required: false };

  if (def.type === "number") {
    return { ...base, type: "number", min: 0 };
  }
  if (def.type === "integer") {
    return { ...base, type: "integer", min: 0 };
  }

  return { ...base, maxLength: MAX_LENGTHS[field] || 255 };
};

/**
 * @param {string} source - source name (e.g., "shark_tank_india")
 * @param {Array<{source, field, transform}>} mappings
 * @param {Object} opts
 * @returns {Object} crosswalk JSON
 */
export const buildCrosswalk = (source, mappings, opts = {}) => {
  const fieldMappings = {};
  const validators = {};

  for (const m of mappings) {
    if (!m.field) continue;

    fieldMappings[m.source] = {
      field: m.field,
      transform: m.transform || "trim",
    };

    const def = CANONICAL_FIELDS[m.field];
    if (def) {
      validators[m.field] = buildValidator(m.field, def);
    }
  }

  return {
    source,
    target: "businesses",
    version: 1,
    description: opts.description || `Auto-generated crosswalk for ${source}`,
    fieldMappings,
    validators,
    defaults: {
      verificationTier: "unverified",
      isProfileComplete: false,
      isExternal: true,
    },
    dedupeKey: "companyName",
  };
};

/**
 * Validate that a built crosswalk has the minimum required fields.
 */
export const validateCrosswalk = (crosswalk) => {
  const errors = [];

  if (!crosswalk.source) errors.push("Missing source");
  if (!crosswalk.fieldMappings || Object.keys(crosswalk.fieldMappings).length === 0) {
    errors.push("No field mappings");
  }

  const hasCompanyName = Object.values(crosswalk.fieldMappings || {}).some(
    (m) => m.field === "companyName"
  );
  if (!hasCompanyName) {
    errors.push("Missing companyName mapping (required for dedupe)");
  }

  return { valid: errors.length === 0, errors };
};