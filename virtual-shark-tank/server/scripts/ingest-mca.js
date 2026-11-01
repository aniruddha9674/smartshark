import fs from "node:fs";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import dotenv from "dotenv";
dotenv.config();

import { pool } from "../src/config/db.postgres.js";
import { parseCIN } from "../src/utils/identifiers.js";

const BATCH_SIZE = 250;

// ───────────────────────────────────────────────────────────
// NIC-2008 top-level sections → human-readable sector labels
// (Used when nic_code is populated. Goa's file mostly has "NA".)
// ───────────────────────────────────────────────────────────
const NIC_SECTORS = {
  "01":"Agriculture","02":"Forestry","03":"Fishing","05":"Mining","06":"Mining","07":"Mining","08":"Mining","09":"Mining",
  "10":"Food Processing","11":"Beverages","12":"Tobacco","13":"Textiles","14":"Apparel","15":"Leather",
  "16":"Wood Products","17":"Paper","18":"Printing","19":"Petroleum","20":"Chemicals","21":"Pharmaceuticals",
  "22":"Rubber & Plastics","23":"Non-metallic Minerals","24":"Basic Metals","25":"Fabricated Metals",
  "26":"Electronics","27":"Electrical Equipment","28":"Machinery","29":"Automotive","30":"Other Transport",
  "31":"Furniture","32":"Other Manufacturing","33":"Repair & Installation","35":"Utilities","36":"Water","37":"Sewerage",
  "38":"Waste Management","39":"Remediation","41":"Construction","42":"Civil Engineering","43":"Specialized Construction",
  "45":"Wholesale & Retail","46":"Wholesale Trade","47":"Retail Trade","49":"Land Transport","50":"Water Transport",
  "51":"Air Transport","52":"Warehousing","53":"Postal","55":"Accommodation","56":"Food Service","58":"Publishing",
  "59":"Motion Pictures","60":"Broadcasting","61":"Telecommunications","62":"IT Services","63":"Information Services",
  "64":"Financial Services","65":"Insurance","66":"Financial Auxiliary","68":"Real Estate","69":"Legal & Accounting",
  "70":"Head Offices","71":"Architecture & Engineering","72":"R&D","73":"Advertising","74":"Other Professional",
  "75":"Veterinary","77":"Rental & Leasing","78":"Employment","79":"Travel","80":"Security","81":"Facilities",
  "82":"Business Support","84":"Public Administration","85":"Education","86":"Healthcare","87":"Residential Care",
  "88":"Social Work","90":"Creative Arts","91":"Libraries & Museums","92":"Gambling","93":"Sports & Recreation",
  "94":"Membership Organizations","95":"Repair of Computers","96":"Personal Services",
};

// ───────────────────────────────────────────────────────────
// Field cleaners and parsers
// ───────────────────────────────────────────────────────────
const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "NA" || s === "na" || s === "N/A") return null;
  return s;
};

const num = (v) => {
  const s = clean(v);
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const titleCase = (s) =>
  s
    ? s
        .toLowerCase()
        .split(/[\s_]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ")
    : null;

const sectorFromNIC = (n) => (n ? NIC_SECTORS[n.slice(0, 2)] || null : null);

// Fallback sector mapper using CompanyIndustrialClassification text.
// Goa's file has nic_code = "NA" for most rows, so this is the real source.
function sectorFromClassification(ic) {
  if (!ic) return null;
  const base = ic.split("(")[0].trim();
  if (!base) return null;
  const lower = base.toLowerCase();
  if (lower.startsWith("manufacturing")) return "Manufacturing";
  if (lower.includes("community") || lower.includes("social")) return "Social Services";
  if (lower.includes("business services")) return "Business Services";
  if (lower.startsWith("trading")) return "Trading";
  if (lower.includes("finance") || lower.includes("insurance")) return "Financial Services";
  if (lower.startsWith("transport")) return "Transport & Logistics";
  if (lower.startsWith("construction")) return "Construction";
  if (lower.startsWith("agriculture")) return "Agriculture";
  if (lower.startsWith("mining")) return "Mining";
  if (lower.startsWith("electricity") || lower.startsWith("gas") || lower.startsWith("water")) return "Utilities";
  if (lower.startsWith("real estate")) return "Real Estate";
  if (lower.includes("health")) return "Healthcare";
  if (lower.includes("education")) return "Education";
  if (lower.startsWith("hotel") || lower.startsWith("restaurant")) return "Hospitality";
  return base.length <= 40 ? base : base.slice(0, 40);
}

const pincodeFromAddr = (a) => {
  if (!a) return null;
  const m = a.match(/(\d{6})(?:-India)?\s*$/);
  return m ? m[1] : null;
};

const DISTRICTS = new Set([
  "north goa", "south goa",
  // add more district names as you ingest more states
]);

const STATES = new Set([
  "goa", "karnataka", "maharashtra", "tamil nadu", "delhi",
  "gujarat", "rajasthan", "uttar pradesh", "west bengal", "telangana",
  // ...full state list
]);

const cityFromAddr = (a) => {
  if (!a) return null;
  const p = a.split(",").map((s) => s.trim()).filter(Boolean);
  if (p.length < 3) return null;

  // Try the 3rd-from-end first, then 4th-from-end
  for (const offset of [3, 4]) {
    const idx = p.length - offset;
    if (idx < 0) continue;
    const c = p[idx];
    if (!c) continue;
    if (c.length < 2 || c.length > 80) continue;
    const lower = c.toLowerCase().replace(/[.\s]+$/, "");
    if (lower === "na" || lower === "n/a") continue;
    if (STATES.has(lower)) continue;
    if (DISTRICTS.has(lower)) continue;
    if (c.toUpperCase() === c) {
      // ALL CAPS city like "PANAJI" — title-case it
      return c.charAt(0) + c.slice(1).toLowerCase();
    }
    return c;
  }
  return null;
};

const stateFromAddr = (a) => {
  if (!a) return null;
  const p = a.split(",").map((s) => s.trim()).filter(Boolean);
  return p.length >= 2 ? p[p.length - 2] : null;
};

// ───────────────────────────────────────────────────────────
// Content hash — stable across runs, detects real changes
// ───────────────────────────────────────────────────────────
const hashRow = (row) =>
  crypto
    .createHash("sha256")
    .update(
      [
        row.CIN,
        row.CompanyName,
        row.CompanyStatus,
        row.AuthorizedCapital,
        row.PaidupCapital,
        row.Registered_Office_Address,
        row.Listingstatus,
        row.nic_code,
      ]
        .map((v) => (v == null ? "" : String(v).trim()))
        .join("|")
    )
    .digest("hex");

// ───────────────────────────────────────────────────────────
// Transform CSV row → { cin, companyName, sector, ... }
// ───────────────────────────────────────────────────────────
function transform(row) {
  const cinRaw = String(row.CIN || "").trim();

  // LLP identifiers (e.g. AAA-1854) — out of scope for equity marketplace
  if (/^[A-Z]{3}-\d{4}$/.test(cinRaw)) {
    return { skipped: true, reason: "llp_out_of_scope", cin: cinRaw };
  }
  // Foreign company codes (e.g. F00976)
  if (/^F\d{5}$/.test(cinRaw)) {
    return { skipped: true, reason: "foreign_company", cin: cinRaw };
  }

  const c = parseCIN(cinRaw);
  if (!c.valid) {
    return { skipped: true, reason: `cin_${c.error}`, cin: cinRaw };
  }

  const addr = clean(row.Registered_Office_Address);
  const nic = clean(row.nic_code);
  const ic = clean(row.CompanyIndustrialClassification);

  return {
    skipped: false,
    record: {
      cin: cinRaw,
      companyName: clean(row.CompanyName),
      companyRoc: clean(row.CompanyROCcode),
      companyCategory: clean(row.CompanyCategory),
      companySubCategory: clean(row.CompanySubCategory),
      companyClass: clean(row.CompanyClass),
      authorizedCapital: num(row.AuthorizedCapital),
      paidUpCapital: num(row.PaidupCapital),
      incorporationDate: clean(row.CompanyRegistrationdate_date),
      registeredAddress: addr,
      listingStatus: clean(row.Listingstatus),
      companyStatus: clean(row.CompanyStatus),
      state: titleCase(clean(row.CompanyStateCode)) || titleCase(stateFromAddr(addr)),
      country: clean(row["CompanyIndian/Foreign Company"]),
      nicCode: nic,
      industrialClassification: ic,
      sector: sectorFromNIC(nic) || sectorFromClassification(ic),
      pincode: pincodeFromAddr(addr),
      city: cityFromAddr(addr),
    },
  };
}

// ───────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/ingest-mca.js <csv>");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(filePath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
  console.log(`Parsed ${rows.length} rows`);

  const stateFile = filePath.split(/[\\/]/).pop();

  const stats = {
    total: rows.length,
    rawInserted: 0,
    rawDuplicate: 0,
    rawFailed: 0,
    businessesUpserted: 0,
    businessesFailed: 0,
    skippedReasons: {},
    statusCounts: {},
    sectorCounts: {},
    pincodeCoverage: 0,
    cityCoverage: 0,
    sectorCoverage: 0,
  };

  // ─── STEP 1: RAW RECORDS ──────────────────────────────
  console.log("\nStep 1: raw_mca_records in batches...");
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    let p = 1;
    for (const row of batch) {
      values.push(`($${p}, $${p + 1}, $${p + 2}::jsonb, $${p + 3})`);
      params.push(row.CIN, hashRow(row), JSON.stringify(row), stateFile);
      p += 4;
    }
    const q = `INSERT INTO raw_mca_records (cin, content_hash, payload, state_file)
               VALUES ${values.join(",")}
               ON CONFLICT (cin, content_hash) DO NOTHING`;
    try {
      const res = await pool.query(q, params);
      stats.rawInserted += res.rowCount;
      stats.rawDuplicate += batch.length - res.rowCount;
    } catch (err) {
      stats.rawFailed += batch.length;
      console.error(`  raw batch failed: ${err.message}`);
    }
  }
  console.log(
    `  rawInserted: ${stats.rawInserted}, duplicates: ${stats.rawDuplicate}, failed: ${stats.rawFailed}, took: ${Date.now() - t0}ms`
  );

  // ─── STEP 2: TRANSFORM ────────────────────────────────
  console.log("\nStep 2: transforming...");
  const transformed = [];
  for (const row of rows) {
    const { skipped, reason, record } = transform(row);
    if (skipped) {
      stats.skippedReasons[reason] = (stats.skippedReasons[reason] || 0) + 1;
      continue;
    }
    if (record.companyStatus)
      stats.statusCounts[record.companyStatus] = (stats.statusCounts[record.companyStatus] || 0) + 1;
    if (record.sector)
      stats.sectorCounts[record.sector] = (stats.sectorCounts[record.sector] || 0) + 1;
    if (record.pincode) stats.pincodeCoverage++;
    if (record.city) stats.cityCoverage++;
    if (record.sector) stats.sectorCoverage++;
    transformed.push(record);
  }
  console.log(
    `  transformed: ${transformed.length}, skipped: ${Object.values(stats.skippedReasons).reduce((a, b) => a + b, 0)}`
  );

  // ─── STEP 3: BUSINESSES UPSERT ────────────────────────
  console.log("\nStep 3: businesses upsert in batches...");
  const t1 = Date.now();

  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of batch) {
      values.push(
        `(NULL, $${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}, $${p + 10}, $${p + 11}, $${p + 12}, $${p + 13}, $${p + 14}, $${p + 15}, $${p + 16}, $${p + 17}, $${p + 18}, true, false, 'unverified', 'mca', 'pending', NOW(), NOW())`
      );
      params.push(
        r.cin,
        r.companyName,
        r.sector,
        r.city,
        r.state,
        r.pincode,
        r.registeredAddress,
        r.companyRoc,
        r.companyStatus,
        r.companyClass,
        r.companyCategory,
        r.companySubCategory,
        r.listingStatus,
        r.authorizedCapital,
        r.paidUpCapital,
        r.incorporationDate,
        r.nicCode,
        r.industrialClassification,
        r.country
      );
      p += 19;
    }

    const q = `
      INSERT INTO businesses (
        owner_id, cin, company_name, sector, city, state, pincode,
        registered_address, company_roc, company_status, company_class, company_category,
        company_sub_category, listing_status, authorized_capital, paid_up_capital,
        incorporation_date, nic_code, industrial_classification, country,
        is_external, is_profile_complete, verification_tier, data_source, enrichment_status,
        created_at, updated_at
      ) VALUES ${values.join(",")}
      ON CONFLICT (cin) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        sector = COALESCE(EXCLUDED.sector, businesses.sector),
        city = COALESCE(EXCLUDED.city, businesses.city),
        state = COALESCE(EXCLUDED.state, businesses.state),
        pincode = COALESCE(EXCLUDED.pincode, businesses.pincode),
        registered_address = COALESCE(EXCLUDED.registered_address, businesses.registered_address),
        company_status = COALESCE(EXCLUDED.company_status, businesses.company_status),
        authorized_capital = COALESCE(EXCLUDED.authorized_capital, businesses.authorized_capital),
        paid_up_capital = COALESCE(EXCLUDED.paid_up_capital, businesses.paid_up_capital),
        nic_code = COALESCE(EXCLUDED.nic_code, businesses.nic_code),
        industrial_classification = COALESCE(EXCLUDED.industrial_classification, businesses.industrial_classification),
        updated_at = NOW()
    `;

    try {
      const res = await pool.query(q, params);
      stats.businessesUpserted += res.rowCount;
    } catch (err) {
      stats.businessesFailed += batch.length;
      console.error(`  biz batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${err.message}`);
    }
  }
  console.log(
    `  upserted: ${stats.businessesUpserted}, failed: ${stats.businessesFailed}, took: ${Date.now() - t1}ms`
  );

  // ─── SUMMARY ──────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════");
  console.log("  INGEST SUMMARY");
  console.log("══════════════════════════════════════════════");
  console.log(
    JSON.stringify(
      {
        total: stats.total,
        rawInserted: stats.rawInserted,
        rawDuplicate: stats.rawDuplicate,
        rawFailed: stats.rawFailed,
        businessesUpserted: stats.businessesUpserted,
        businessesFailed: stats.businessesFailed,
        skippedReasons: stats.skippedReasons,
        pincodeCoverage: `${((stats.pincodeCoverage / stats.total) * 100).toFixed(1)}%`,
        cityCoverage: `${((stats.cityCoverage / stats.total) * 100).toFixed(1)}%`,
        sectorCoverage: `${((stats.sectorCoverage / stats.total) * 100).toFixed(1)}%`,
      },
      null,
      2
    )
  );

  console.log("\nStatus distribution:");
  for (const [s, n] of Object.entries(stats.statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(35)} ${n}`);
  }

  console.log("\nTop 10 sectors:");
  for (const [s, n] of Object.entries(stats.sectorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)) {
    console.log(`  ${s.padEnd(35)} ${n}`);
  }

  console.log("══════════════════════════════════════════════");
  console.log(`\nTotal time: ${Date.now() - t0}ms`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});