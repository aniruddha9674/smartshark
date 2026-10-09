/**
 * Transform registry. Each transform is a pure function: (rawValue, row) => value.
 * Returning `undefined` means "no value" (treated as null downstream).
 */

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const stripped = String(v).replace(/[^0-9.-]/g, "");
  if (stripped === "" || stripped === "-" || stripped === ".") return undefined;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : undefined;
};

export const transforms = {
  trim: (v) => (v ? String(v).trim() : undefined),

  toLower: (v) => (v ? String(v).trim().toLowerCase() : undefined),

  toNumber,

  toInteger: (v) => {
    const n = toNumber(v);
    return n === undefined ? undefined : Math.round(n);
  },

  // "50,00,000" or "50 Lakhs" or "5 Cr" -> numeric INR
toINR: (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const s = String(v).toLowerCase().replace(/[₹,\s]/g, "");

  // crore: "5cr", "5crore", "5crores"
  const crMatch = s.match(/^([\d.]+)(cr|crore|crores)$/);
  if (crMatch) return Math.round(Number(crMatch[1]) * 10_000_000);

  // lakh: "50lakh", "50lakhs", "50lac", "50lacs", "50l"
  const lakhMatch = s.match(/^([\d.]+)(lakh|lakhs|lac|lacs|l)$/);
  if (lakhMatch) return Math.round(Number(lakhMatch[1]) * 100_000);

  // plain number: "5000000"
  return toNumber(v);
},

  // "USD" amounts -> INR. Rate is a hardcoded approximation.
  // In production, use a fixed daily rate from a rates provider.
  usdToInr: (v) => {
    const n = toNumber(v);
    return n === undefined ? undefined : Math.round(n * 83);
  },

  // "Yes"/"No"/"Y"/"N"/"Deal"/"Out" -> boolean
  toBoolean: (v) => {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim().toLowerCase();
    if (["yes", "y", "true", "deal", "1"].includes(s)) return true;
    if (["no", "n", "false", "out", "0"].includes(s)) return false;
    return undefined;
  },

  // "2021" or "2021-01-15" -> integer year
  toYear: (v) => {
    if (!v) return undefined;
    const match = String(v).match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : undefined;
  },

  // "Bangalore" / "Bengaluru" / "BLR" -> "bengaluru"
  normalizeCity: (v) => {
    if (!v) return undefined;
    const s = String(v).trim().toLowerCase();
    const map = {
      bangalore: "bengaluru",
      bengaluru: "bengaluru",
      blr: "bengaluru",
      bombay: "mumbai",
      mumbai: "mumbai",
      newdelhi: "delhi",
      "new delhi": "delhi",
      delhi: "delhi",
      gurgaon: "gurugram",
      gurugram: "gurugram",
      noida: "noida",
      chennai: "chennai",
      madras: "chennai",
      hyderabad: "hyderabad",
      pune: "pune",
      kolkata: "kolkata",
      calcutta: "kolkata",
      ahmedabad: "ahmedabad",
    };
    const cleaned = s.replace(/\s+/g, "");
    return map[cleaned] || map[s] || s;
  },

  // "SaaS" / "Software as a Service" -> "saas"
  normalizeSector: (v) => {
    if (!v) return undefined;
    const s = String(v).trim().toLowerCase();
    const map = {
      saas: "saas",
      "software as a service": "saas",
      software: "saas",
      fintech: "fintech",
      "financial technology": "fintech",
      finance: "fintech",
      healthcare: "healthcare",
      health: "healthcare",
      medtech: "healthcare",
      "e-commerce": "ecommerce",
      ecommerce: "ecommerce",
      "online retail": "ecommerce",
      edtech: "edtech",
      education: "edtech",
      agritech: "agritech",
      agriculture: "agritech",
      food: "foodtech",
      foodtech: "foodtech",
      "food & beverage": "foodtech",
"food and beverage": "foodtech",
      logistics: "logistics",
      "supply chain": "logistics",
      manufacturing: "manufacturing",
      hardware: "hardware",
      "deep tech": "deeptech",
      deeptech: "deeptech",
      ai: "ai",
      "artificial intelligence": "ai",
    };
    return map[s] || s;
  },
    // "2015" or "2015-01-15" -> 11 (years operating, current year 2026)
  toOperatingYears: (v) => {
    if (!v) return undefined;
    const match = String(v).match(/\b(19|20)\d{2}\b/);
    if (!match) return undefined;
    const foundedYear = Number(match[0]);
    const years = new Date().getFullYear() - foundedYear;
    return years >= 0 && years <= 100 ? years : undefined;
  },
    lakhsToINR: (v) => {
    const n = toNumber(v);
    return n === undefined ? undefined : Math.round(n * 100_000);
  },
};

export const applyTransform = (transformName, value, row) => {
  if (!transformName) return value;
  const fn = transforms[transformName];
  if (!fn) {
    throw new Error(`Unknown transform: ${transformName}`);
  }
  return fn(value, row);
};