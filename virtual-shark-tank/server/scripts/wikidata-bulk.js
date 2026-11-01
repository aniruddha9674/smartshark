import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "SmartShark/1.0 (educational; contact@example.com)";
const YEAR_TOLERANCE = 5;
const SLEEP_BETWEEN_QUERIES = 3000;

// ─── Helpers ───────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\b(private|pvt|public|limited|ltd|llp|opc|corporation|corp|inc|india)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function runSparql(query) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`WDQS ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return (await res.json()).results.bindings;
}

// ─── Fetch all Indian companies from Wikidata ──────────────
async function fetchAllIndianBusinesses() {
  console.log("Fetching all Indian businesses from Wikidata...");
  const wd = new Map(); // normalized_name -> { item, label, website, inception, twitter, linkedin }

  // Slice by inception year to stay under WDQS 60s timeout
  const ranges = [
    [1800, 1980],
    [1980, 2000],
    [2000, 2010],
    [2010, 2027],
  ];

  for (const [from, to] of ranges) {
    console.log(`  Querying inception ${from}-${to}...`);
    const start = Date.now();
    try {
      const rows = await runSparql(`
        SELECT ?item ?itemLabel ?website ?inception ?twitter ?linkedin WHERE {
          ?item wdt:P17 wd:Q668 .
          ?item wdt:P31 ?type .
          VALUES ?type {
            wd:Q783794 wd:Q4830453 wd:Q891723 wd:Q210167
            wd:Q431289 wd:Q18388277 wd:Q1058914 wd:Q219577
          }
          ?item wdt:P571 ?inception .
          FILTER(YEAR(?inception) >= ${from} && YEAR(?inception) < ${to})
          OPTIONAL { ?item wdt:P856 ?website }
          OPTIONAL { ?item wdt:P2002 ?twitter }
          OPTIONAL { ?item wdt:P4264 ?linkedin }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `);

      console.log(`    → ${rows.length} entities (${((Date.now() - start) / 1000).toFixed(1)}s)`);

      for (const r of rows) {
        const entry = {
          item: r.item.value,
          label: r.itemLabel?.value,
          website: r.website?.value,
          inception: r.inception?.value,
          twitter: r.twitter?.value,
          linkedin: r.linkedin?.value,
        };
        if (entry.label) {
          wd.set(normalize(entry.label), entry);
        }
      }
    } catch (err) {
      console.error(`    ✗ Query failed: ${err.message}`);
    }
    await sleep(SLEEP_BETWEEN_QUERIES);
  }

  // Also fetch Indian businesses without inception date
  console.log(`  Querying businesses without inception date...`);
  try {
    const rows = await runSparql(`
      SELECT ?item ?itemLabel ?website ?twitter ?linkedin WHERE {
        ?item wdt:P17 wd:Q668 .
        ?item wdt:P31 ?type .
        VALUES ?type { wd:Q783794 wd:Q4830453 wd:Q891723 wd:Q210167 }
        FILTER NOT EXISTS { ?item wdt:P571 ?x }
        OPTIONAL { ?item wdt:P856 ?website }
        OPTIONAL { ?item wdt:P2002 ?twitter }
        OPTIONAL { ?item wdt:P4264 ?linkedin }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `);
    console.log(`    → ${rows.length} entities (no inception)`);
    for (const r of rows) {
      const entry = {
        item: r.item.value,
        label: r.itemLabel?.value,
        website: r.website?.value,
        inception: null,
        twitter: r.twitter?.value,
        linkedin: r.linkedin?.value,
      };
      if (entry.label) wd.set(normalize(entry.label), entry);
    }
  } catch (err) {
    console.error(`    ✗ No-inception query failed: ${err.message}`);
  }

  console.log(`\nTotal unique Wikidata entries indexed: ${wd.size}\n`);
  return wd;
}

// ─── Match locally against MCA businesses ─────────────────
async function matchAndEnrich(wd) {
  console.log("Loading MCA businesses needing website...");
  const { rows } = await pool.query(`
    SELECT id, company_name, incorporation_date, website_url
    FROM businesses
    WHERE data_source = 'mca'
      AND website_url IS NULL
      AND (
        (company_status = 'Active' AND authorized_capital >= 10000000)
        OR listing_status = 'Listed'
        OR badges @> '["well_known"]'::jsonb
        OR owner_id IS NOT NULL
      )
  `);
  console.log(`  ${rows.length} businesses to match\n`);

  let matched = 0;
  let rejected_year = 0;
  let rejected_no_year = 0;
  const updates = [];

  for (const b of rows) {
    const key = normalize(b.company_name);
    const wdEntry = wd.get(key);
    if (!wdEntry) continue;

    // Verification: require inception year match if both have dates
    const mcaYear = b.incorporation_date ? new Date(b.incorporation_date).getFullYear() : null;
    const wdYear = wdEntry.inception ? new Date(wdEntry.inception).getFullYear() : null;

    let verified = false;
    if (mcaYear && wdYear) {
      if (Math.abs(mcaYear - wdYear) <= YEAR_TOLERANCE) verified = true;
      else rejected_year++;
    } else {
      rejected_no_year++;
    }

    if (!verified) continue;

    const updates_obj = {
      website_url: wdEntry.website ? new URL(wdEntry.website).hostname.replace(/^www\./, "") : null,
      curated_note: wdEntry.label ? `Wikidata: ${wdEntry.label}${wdYear ? ` (founded ${wdYear})` : ""}` : null,
    };
    if (wdEntry.twitter) updates_obj.twitter_url = `https://twitter.com/${wdEntry.twitter}`;
    if (wdEntry.linkedin) updates_obj.linkedin_url = `https://linkedin.com/company/${wdEntry.linkedin}`;

    if (!updates_obj.website_url && !updates_obj.twitter_url && !updates_obj.linkedin_url) continue;

    updates.push({ id: b.id, data: updates_obj, name: b.company_name, wdItem: wdEntry.item, mcaYear, wdYear });
    matched++;
  }

  console.log(`=== Match results ===`);
  console.log(`  Name matches:          ${matched + rejected_year + rejected_no_year}`);
  console.log(`  ✓ Verified (year match): ${matched}`);
  console.log(`  ✗ Rejected (year mismatch): ${rejected_year}`);
  console.log(`  ✗ Skipped (missing date on one side): ${rejected_no_year}`);
  console.log();

  // Apply updates in batches
  console.log("Applying updates...");
  const BATCH = 100;
  let applied = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const valueParts = [];
    const params = [];
    let p = 1;
    for (const u of batch) {
      valueParts.push(`($${p}::uuid, $${p + 1}::text, $${p + 2}::text, $${p + 3}::text, $${p + 4}::text)`);
      params.push(u.id, u.data.website_url || null, u.data.curated_note || null, u.data.twitter_url || null, u.data.linkedin_url || null);
      p += 5;
    }
    await pool.query(`
      UPDATE businesses AS b
      SET website_url = COALESCE(v.website, b.website_url),
          curated_note = COALESCE(v.curated_note, b.curated_note),
          twitter_url = COALESCE(v.twitter, b.twitter_url),
          linkedin_url = COALESCE(v.linkedin, b.linkedin_url),
          badges = CASE
            WHEN b.badges @> '["well_known"]'::jsonb THEN b.badges
            ELSE b.badges || '["well_known"]'::jsonb
          END,
          updated_at = NOW()
      FROM (VALUES ${valueParts.join(", ")}) AS v(id, website, curated_note, twitter, linkedin)
      WHERE b.id = v.id
    `, params);
    applied += batch.length;
    if (applied % 200 === 0) console.log(`  ${applied}/${updates.length}`);
  }

  console.log(`\n✓ Enriched ${applied} businesses\n`);

  // Show sample verified matches
  console.log("=== Sample verified matches ===");
  for (const u of updates.slice(0, 15)) {
    console.log(`  ${u.name.slice(0, 45).padEnd(45)} (MCA ${u.mcaYear}, WD ${u.wdYear})`);
    if (u.data.website_url) console.log(`    → ${u.data.website_url}`);
  }

  return { matched, applied, rejected_year, rejected_no_year };
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log("Warming up DB...");
  await pool.query("SELECT 1");
  console.log("✓ DB connected\n");

  const wd = await fetchAllIndianBusinesses();
  if (wd.size === 0) {
    console.error("No Wikidata data fetched. Aborting.");
    await pool.end();
    process.exit(1);
  }

  const result = await matchAndEnrich(wd);
  console.log("=== Final summary ===");
  console.log(result);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});