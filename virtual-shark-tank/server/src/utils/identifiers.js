const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_STATE_CODES = new Set(
  Array.from({ length: 37 }, (_, i) => String(i + 1).padStart(2, "0"))
);
const PAN_HOLDER_TYPES = new Set(["P", "C", "H", "F", "A", "T", "B", "L", "J", "G"]);

export function parseGSTIN(input) {
  if (!input || typeof input !== "string") return { valid: false, error: "empty" };

  const gstin = input.trim().toUpperCase().replace(/\s/g, "");
  if (gstin.length !== 15) return { valid: false, error: "length", gstin };

  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return { valid: false, error: "format", gstin };
  }

  const stateCode = gstin.slice(0, 2);
  if (!GSTIN_STATE_CODES.has(stateCode)) {
    return { valid: false, error: "invalid_state_code", gstin, stateCode };
  }

  const expected = computeGSTINChecksum(gstin.slice(0, 14));
  if (expected !== gstin[14]) {
    return { valid: false, error: "checksum", gstin, expected, got: gstin[14] };
  }

  return {
    valid: true,
    gstin,
    stateCode,
    pan: gstin.slice(2, 12),
    entityNumber: gstin[12],
    checksum: gstin[14],
  };
}

function computeGSTINChecksum(gstin14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(gstin14[i]);
    if (value === -1) return null;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export function parseCIN(input) {
  if (!input || typeof input !== "string") return { valid: false, error: "empty" };

  const cin = input.trim().toUpperCase().replace(/\s/g, "");
  if (cin.length !== 21) return { valid: false, error: "length", cin };

  if (!/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(cin)) {
    return { valid: false, error: "format", cin };
  }

  const year = parseInt(cin.slice(8, 12), 10);
  const currentYear = new Date().getFullYear();
  if (year < 1850 || year > currentYear) {
    return { valid: false, error: "implausible_year", cin, year };
  }

  return {
    valid: true,
    cin,
    listingStatus: cin[0],              // L = Listed, U = Unlisted
    industryCode: cin.slice(1, 6),
    stateCode: cin.slice(6, 8),
    incorporationYear: year,
    ownershipType: cin.slice(12, 15),   // PTC, LTD, etc.
    registrationNumber: cin.slice(15, 21),
  };
}

export function parsePAN(input) {
  if (!input || typeof input !== "string") return { valid: false, error: "empty" };

  const pan = input.trim().toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return { valid: false, error: "format", pan };
  }

  const holderType = pan[3];
  if (!PAN_HOLDER_TYPES.has(holderType)) {
    return { valid: false, error: "invalid_holder_type", pan, holderType };
  }

  return {
    valid: true,
    pan,
    holderType,
    isCompany: holderType === "C",
    isFirm: holderType === "F",
    isIndividual: holderType === "P",
  };
}

export function parseLLPIN(input) {
  if (!input || typeof input !== "string") return { valid: false, error: "empty" };

  const llpin = input.trim().toUpperCase().replace(/\s/g, "");
  if (llpin.length !== 8) return { valid: false, error: "length", llpin };

  if (!/^[A-Z]{3}-[0-9]{4}$/.test(llpin)) {
    return { valid: false, error: "format", llpin };
  }

  return { valid: true, llpin };
}