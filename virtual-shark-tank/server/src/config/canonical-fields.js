export const CANONICAL_FIELDS = {
  companyName: {
    type: "string",
    required: true,
    synonyms: [
      "company name", "startup name", "business name", "brand", "name",
      "firm name", "enterprise name", "startup", "company", "organization",
      "trade name", "legal name", "business",
    ],
  },
  sector: {
    type: "string",
    required: false,
    synonyms: [
      "industry", "sector", "vertical", "category", "domain", "industry type",
      "industry vertical", "business type", "business category",
    ],
  },
  city: {
    type: "string",
    required: false,
    synonyms: [
      "city", "location", "headquarters", "hq", "based in", "city location",
      "pitchers city", "region", "office location", "primary city",
    ],
  },
  websiteUrl: {
    type: "string",
    required: false,
    synonyms: [
      "website", "website url", "company website", "url", "site", "web",
      "homepage", "company url", "domain",
    ],
  },
  description: {
    type: "string",
    required: false,
    synonyms: [
      "description", "about", "summary", "business description", "overview",
      "business summary", "company description", "pitch", "short description",
      "long summary",
    ],
  },
  fundingAsk: {
    type: "number",
    required: false,
    synonyms: [
      "ask", "ask amount", "funding ask", "funding required", "raise",
      "target raise", "original ask amount", "investment required",
      "amount", "funding", "investment ask","funding amount",
"funding amount usd",
"amount usd",
"amount in usd",
    ],
  },
  yearsOperating: {
    type: "integer",
    required: false,
    synonyms: [
      "years operating", "years in business", "operating years", "age",
      "started in", "founded", "year founded", "founded year", "incorporation year","funding year",
"funding_year",
"funding round year",
    ],
  },
  udyamNumber: {
    type: "string",
    required: false,
    synonyms: [
      "udyam", "udyam number", "udyam registration", "msme number",
      "udyam registration number",
    ],
  },
  gstNumber: {
    type: "string",
    required: false,
    synonyms: [
      "gst", "gstin", "gst number", "gst registration", "tax id",
    ],
  },
  shopActLicense: {
    type: "string",
    required: false,
    synonyms: [
      "shop act", "shop act license", "shop establishment", "trade license",
    ],
  },
};

export const getCanonicalFieldNames = () => Object.keys(CANONICAL_FIELDS);