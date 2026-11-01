import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";
import dns from "node:dns/promises";

const LIMIT = Number(process.argv[2]) || 25;

const NOISE = new Set([
  "private", "pvt", "limited", "ltd", "llp", "opc", "india", "indian",
  "the", "and", "of", "co", "company", "corporation", "corp", "inc",
  "technologies", "technology", "solutions", "services", "systems",
  "development", "centre", "center", "innovation", "enterprises", "industries",
]);

// Extract the brand token — the first meaningful word of the company name.
// "AMAZON DEVELOPMENT CENTRE (INDIA) PRIVATE LIMITED" → "amazon"
// "H.M.T. LIMITED" → "hmt" (strip dots BEFORE splitting)
// "PHONEPE INSURANCE BROKING SERVICES" → "phonepe"
const GENERIC_WORDS = new Set([
  // Indian generic prefixes / suffixes
  "shree", "shri", "sri", "jai", "bharat", "india", "indian",
  // Location / descriptor words
  "village", "city", "metro", "urban", "rural", "district", "national",
  "state", "central", "regional", "local", "new", "old", "modern",
  // Generic business words
  "prime", "star", "global", "universal", "united", "general", "standard",
  "royal", "grand", "golden", "green", "blue", "red", "sun", "moon",
  "max", "apex", "zenith", "summit", "first", "top", "best", "premier",
  "supreme", "supreme", "smart", "next", "future", "prime",
]);

// Returns candidate brands ordered by specificity (longest non-generic first)
function brandCandidates(companyName) {
  const cleaned = companyName.replace(/[^\w\s]/g, "").toUpperCase();
  const tokens = cleaned
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !GENERIC_WORDS.has(w));

  // Sort by length descending — longer tokens are more distinctive
  return [...new Set(tokens)].sort((a, b) => b.length - a.length);
}

async function findDomain(companyName) {
  const candidates = brandCandidates(companyName);
  if (candidates.length === 0) return { status: "skipped", reason: "no_brand" };

  // Try each brand candidate in order of specificity
  for (const brand of candidates) {
    const domainsToProbe = [
      `${brand}.com`,
      `${brand}.in`,
      `${brand}.co.in`,
      `${brand}.io`,
      `${brand}india.com`,
      `${brand}india.in`,
    ];

    for (const candidate of domainsToProbe) {
      if (await probeCandidate(candidate, brand)) {
        return { status: "found", domain: candidate, brand };
      }
    }
  }

  return { status: "failed", reason: "no_candidates_matched" };
}

async function domainResolves(host) {
  try {
    await Promise.race([
      dns.lookup(host),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 2500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function pageMentionsBrand(host, brand) {
  try {
    const res = await fetch(`https://${host}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartSharkBot/1.0)" },
    });
    if (!res.ok) return false;
    const html = (await res.text()).toLowerCase().slice(0, 200_000);
    return html.includes(brand);
  } catch {
    return false;
  }
}

async function probeCandidate(host, brand) {
  const resolves = await domainResolves(host);
  if (!resolves) return false;
  return await pageMentionsBrand(host, brand);
}



async function main() {
  await pool.query("SELECT 1");
  console.log("✓ DB connected\n");

  const { rows } = await pool.query(
    `SELECT id, cin, company_name, city, authorized_capital
     FROM businesses
     WHERE data_source = 'mca'
       AND company_status = 'Active'
       AND website_url IS NULL
       AND authorized_capital > 0
     ORDER BY authorized_capital DESC NULLS LAST
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`Probing domains for top ${rows.length} by capital...\n`);

  let found = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const start = Date.now();
    const result = await findDomain(b.company_name);
    const elapsed = Date.now() - start;
    const capital = b.authorized_capital
      ? `₹${(Number(b.authorized_capital) / 100000).toFixed(0)}L`
      : "₹?";

    if (result.status === "found") {
      await pool.query(
        `UPDATE businesses SET website_url = $1, domain_discovery_status = 'found', domain_discovery_attempted_at = NOW(), domain_discovery_reason = $2 WHERE id = $3`,
        [result.domain, `brand_probe:${result.brand}`, b.id]
      );
      found++;
      console.log(`  ✓ [${i + 1}/${rows.length}] ${capital} | ${b.company_name.slice(0, 45)} → ${result.domain} (${elapsed}ms)`);
    } else {
      await pool.query(
        `UPDATE businesses SET domain_discovery_status = 'failed', domain_discovery_attempted_at = NOW(), domain_discovery_reason = $1 WHERE id = $2`,
        [result.reason, b.id]
      );
      if (result.status === "skipped") skipped++;
      else failed++;
      console.log(`  ✗ [${i + 1}/${rows.length}] ${capital} | ${b.company_name.slice(0, 45)} (${result.reason}, ${elapsed}ms)`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Found:   ${found}/${rows.length} (${((found / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  await pool.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });