/**
 * Rules-based transform inference.
 * Given sample values and a target canonical field, pick the transform.
 * No LLM. Deterministic. Testable.
 */

const isYearLike = (v) => {
  if (v === null || v === undefined) return false;
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() + 1;
};

const isNumericLike = (v) => {
  if (v === null || v === undefined || v === "") return false;
  return Number.isFinite(Number(String(v).replace(/[,\s]/g, "")));
};

const isIntegerLike = (v) => {
  if (!isNumericLike(v)) return false;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isInteger(n);
};

const isBooleanLike = (v) => {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return ["yes", "no", "y", "n", "true", "false", "1", "0"].includes(s);
};

const looksLikeCurrency = (v) => {
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return /[₹]|lakh|lac|crore|cr\b/.test(s);
};

const looksLikeDate = (v) => {
  if (v === null || v === undefined) return false;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s);
};

const allMatch = (values, fn) => {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every(fn);
};

const fractionMatch = (values, fn) => {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.filter(fn).length / nonEmpty.length;
};

/**
 * Infer transform rules. Ordered from most-specific to least-specific.
 * Each rule: { name, test, transform, confidence, reason }
 */
const RULES = [
  // Funding amounts in lakhs (small numbers in funding fields)
  {
  name: "funding_usd_by_name",
  test: (values, target, columnName) => {
    if (target !== "fundingAsk") return false;
    const lower = String(columnName || "").toLowerCase();
    return /usd|dollar|dollars|\$/.test(lower);
  },
  transform: "usdToInr",
  confidence: "high",
  reason: "column name indicates USD amounts",
},
  {
    name: "funding_lakhs",
    test: (values, target) => {
      if (target !== "fundingAsk") return false;
      if (!allMatch(values, isNumericLike)) return false;
      const nums = values
        .map((v) => Number(String(v).replace(/[,\s]/g, "")))
        .filter((n) => Number.isFinite(n));
      if (nums.length === 0) return false;
      const median = nums.sort((a, b) => a - b)[Math.floor(nums.length / 2)];
      return median < 10000;
    },
    transform: "lakhsToINR",
    confidence: "high",
    reason: "numeric values in lakhs range for fundingAsk",
  },
  

  // Funding amounts with currency strings ("50 Lakhs", "2 Cr")
  {
    name: "funding_currency_string",
    test: (values, target) =>
      target === "fundingAsk" && fractionMatch(values, looksLikeCurrency) > 0.5,
    transform: "toINR",
    confidence: "high",
    reason: "currency strings detected",
  },

  // Any other funding field that's plain numeric
  {
    name: "funding_plain",
    test: (values, target) => target === "fundingAsk" && allMatch(values, isNumericLike),
    transform: "toNumber",
    confidence: "medium",
    reason: "plain numeric values for fundingAsk",
  },

  // Founding year → yearsOperating
  {
    name: "years_from_year",
    test: (values, target) => target === "yearsOperating" && allMatch(values, isYearLike),
    transform: "toOperatingYears",
    confidence: "high",
    reason: "4-digit year values for yearsOperating",
  },

  // Explicit numeric yearsOperating
  {
    name: "years_numeric",
    test: (values, target) => target === "yearsOperating" && allMatch(values, isIntegerLike),
    transform: "toInteger",
    confidence: "high",
    reason: "plain integer years",
  },

  // Boolean fields
  {
    name: "boolean",
    test: (values) => allMatch(values, isBooleanLike),
    transform: "toBoolean",
    confidence: "high",
    reason: "boolean-like values",
  },

  // City normalization
  {
    name: "city",
    test: (values, target) => target === "city",
    transform: "normalizeCity",
    confidence: "high",
    reason: "city field",
  },

  // Sector normalization
  {
    name: "sector",
    test: (values, target) => target === "sector",
    transform: "normalizeSector",
    confidence: "high",
    reason: "sector field",
  },

  // Date → year
  {
    name: "date_to_year",
    test: (values, target) =>
      (target === "yearsOperating") && allMatch(values, looksLikeDate),
    transform: "toYear",
    confidence: "medium",
    reason: "date strings for year field",
  },

  // Plain integer for integer targets
  {
    name: "integer",
    test: (values, target) => {
      const integerFields = ["yearsOperating"];
      return integerFields.includes(target) && allMatch(values, isIntegerLike);
    },
    transform: "toInteger",
    confidence: "medium",
    reason: "integer target",
  },

  // Fallback: trim everything
  {
    name: "default",
    test: () => true,
    transform: "trim",
    confidence: "low",
    reason: "default — string trim",
  },
  
];

/**
 * @param {string[]} sampleValues - up to 20 sample values from the CSV column
 * @param {string} targetField - canonical field name (e.g., "fundingAsk")
 * @returns {{ transform: string, confidence: string, reason: string }}
 */
export const inferTransform = (sampleValues, targetField, sourceColumn = "") => {
  for (const rule of RULES) {
    if (rule.test(sampleValues, targetField, sourceColumn)) {
      return {
        transform: rule.transform,
        confidence: rule.confidence,
        reason: rule.reason,
      };
    }
  }
  return { transform: "trim", confidence: "low", reason: "no rule matched" };
};