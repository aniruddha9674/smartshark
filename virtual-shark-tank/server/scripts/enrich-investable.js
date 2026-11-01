import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";
import pLimit from "p-limit";
import { extractLogoFromDomain } from "../src/services/logo.service.js";

// ─── Config ────────────────────────────────────────────────
const PHASE = process.argv[2] || "all";
const CONCURRENCY = 5;
const WIKIDATA_DELAY_MS = 1000;
const PORTAL_DELAY_MS = 2000;

const INVESTABLE_WHERE = `
  data_source = 'mca'
  AND (
    (company_status = 'Active' AND authorized_capital >= 10000000)
    OR listing_status = 'Listed'
    OR badges @> '["well_known"]'::jsonb
    OR owner_id IS NOT NULL
  )
`;

// ─── Helpers ───────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function logProgress(phase, done, total) {
  const pct = ((done / total) * 100).toFixed(1);
  console.log(`[${phase}] ${done}/${total} (${pct}%)`);
}

// ─── Phase 1: generate_description ────────────────────────
async function generateDescription(b) {
  const year = b.incorporation_date
    ? new Date(b.incorporation_date).getFullYear()
    : null;
  const capital = b.authorized_capital
    ? `₹${(Number(b.authorized_capital) / 100000).toFixed(1)} L`
    : null;

  const parts = [];
  parts.push(
    `${b.company_name} is a ${(b.company_class || "private").toLowerCase()} company`
  );
  if (b.sector) parts[0] += ` operating in the ${b.sector.toLowerCase()} sector`;
  if (b.city) parts[0] += `, based in ${b.city}${b.state ? `, ${b.state}` : ""}.`;
  else parts[0] += ".";

  if (year) parts.push(`Incorporated in ${year}.`);
  if (capital) parts.push(`Authorized capital: ${capital}.`);

  parts.push(
    "Financial details and traction metrics have not been provided by the business owner."
  );

  const description = parts.join(" ");
  const tagline = b.sector
    ? `${b.sector} company${b.city ? ` in ${b.city}` : ""}`
    : null;

  // Merge provenance in Node, pass as JSONB parameter — avoids SQL string concat bugs
  const provenance = {
    ...(typeof b.field_provenance === "object" && b.field_provenance
      ? b.field_provenance
      : {}),
    description: {
      source: "template",
      tier: "generated",
      updated: new Date().toISOString().slice(0, 10),
    },
  };

  await pool.query(
    `UPDATE businesses
     SET description = $1,
         tagline = COALESCE(tagline, $2),
         field_provenance = $3::jsonb,
         updated_at = NOW()
     WHERE id = $4`,
    [description, tagline, JSON.stringify(provenance), b.id]
  );
}
// ─── Phase 2: fetch_wikidata ──────────────────────────────
async function fetchWikidata(b) {
  if (b.website_url) return; // already have it

  const cleanName = b.company_name
    .replace(/\b(PRIVATE|PVT|LIMITED|LTD|LLP|OPC|CORPORATION|CORP|INC)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanName.length < 4) return;

  const sparql = `
    SELECT ?website ?description WHERE {
      ?company rdfs:label "${cleanName}"@en .
      ?company wdt:P17 wd:Q668 .
      OPTIONAL { ?company wdt:P856 ?website . }
      OPTIONAL { ?company schema:description ?description . FILTER(LANG(?description) = "en") }
    } LIMIT 1
  `;

  try {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
        "User-Agent": "SmartShark/1.0 (educational)",
      },
      body: sparql,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json();
    const binding = data.results?.bindings?.[0];
    if (!binding) return;

    const updates = {};
    if (binding.website?.value) {
      try {
        updates.website_url = new URL(binding.website.value).hostname.replace(
          /^www\./,
          ""
        );
      } catch {}
    }
    if (binding.description?.value) {
      updates.curated_note = binding.description.value.slice(0, 500);
    }
    if (Object.keys(updates).length === 0) return;

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
    const values = Object.values(updates);
    values.push(b.id);

    await pool.query(
      `UPDATE businesses
       SET ${setClauses.join(", ")},
           badges = CASE
             WHEN badges @> '["well_known"]'::jsonb THEN badges
             ELSE badges || '["well_known"]'::jsonb
           END,
           updated_at = NOW()
       WHERE id = $${values.length}`,
      values
    );
    return "hit";
  } catch {
    return;
  }
}

// ─── Phase 3: fetch_logo ──────────────────────────────────
async function fetchLogo(b) {
  if (!b.website_url) return false;

  try {
    const result = await extractLogoFromDomain(b.website_url);
    if (!result) return false;

    await pool.query(
      `UPDATE businesses
       SET logo_url = $1, logo_checked_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [result.url, b.id]
    );
    return true;
  } catch {
    await pool.query(
      `UPDATE businesses SET logo_checked_at = NOW() WHERE id = $1`,
      [b.id]
    );
    return false;
  }
}

// Inside main, replace the logos block:
if (PHASE === "all" || PHASE === "logos") {
  console.log("=== Phase 3: Logos (concurrent, JSON-LD first) ===");

  const { rows: refreshed } = await pool.query(
    `SELECT id, website_url, logo_url FROM businesses
     WHERE ${INVESTABLE_WHERE}
       AND website_url IS NOT NULL
       AND logo_url IS NULL
       AND logo_checked_at IS NULL`
  );
  console.log(`Pending: ${refreshed.length}`);

  const limit = pLimit(15);
  let done = 0, found = 0;
  const t0 = Date.now();

  await Promise.all(
    refreshed.map((b) =>
      limit(async () => {
        try {
          if (await fetchLogo(b)) found++;
        } catch {}
        done++;
        if (done % 100 === 0) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          const rate = (done / (elapsed || 1)).toFixed(1);
          console.log(`[logos] ${done}/${refreshed.length} | found: ${found} | ${rate}/s`);
        }
      })
    )
  );

  console.log(`✓ Logos: ${found}/${refreshed.length} found\n`);
}

// ─── Phase 4: fetch_directors (MCA scrape) ───────────────
async function fetchDirectors(b) {
  if (!b.cin) return;

  const existing = await pool.query(
    `SELECT 1 FROM business_directors WHERE business_id = $1 LIMIT 1`,
    [b.id]
  );
  if (existing.rows.length > 0) return;

  try {
    const res = await fetch(
      `https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do?companyID=${b.cin}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartSharkBot/1.0)" },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return;
    const html = await res.text();
    const dinMatches = [...html.matchAll(/(\d{8})\s*[-–]\s*([A-Z\s]{4,})/g)];
    const directors = dinMatches
      .map((m) => ({ din: m[1], name: m[2].trim() }))
      .filter((d) => d.name.length > 3)
      .slice(0, 20);

    for (const d of directors) {
      await pool.query(
        `INSERT INTO business_directors (business_id, din, name, source)
         VALUES ($1, $2, $3, 'mca')
         ON CONFLICT (business_id, din) DO NOTHING`,
        [b.id, d.din, d.name]
      );
    }
  } catch {
    // portal may block, skip silently
  }
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log(`Phase: ${PHASE}`);
  console.log("Warming up DB...");
  await pool.query("SELECT 1");
  console.log("✓ DB connected\n");

  // Load all investable businesses
  const { rows } = await pool.query(
    `SELECT id, cin, company_name, sector, city, state, company_class,
            authorized_capital, incorporation_date, description, tagline,
            website_url, logo_url, listing_status
     FROM businesses
     WHERE ${INVESTABLE_WHERE}
     ORDER BY
       CASE
         WHEN badges @> '["well_known"]'::jsonb THEN 1
         WHEN listing_status = 'Listed' THEN 2
         WHEN authorized_capital >= 1000000000 THEN 3
         WHEN authorized_capital >= 100000000  THEN 4
         ELSE 5
       END,
       authorized_capital DESC NULLS LAST`
  );

  console.log(`Loaded ${rows.length} investable businesses\n`);

  // ─── PHASE 1: Descriptions (fast, no API) ────────────
if (PHASE === "all" || PHASE === "descriptions") {
  console.log("=== Phase 1: Descriptions (batched) ===");

  // Build all descriptions in memory first
  const pending = rows.filter(
    (b) => !(b.description && b.description.length > 50)
  );
  console.log(`Businesses needing descriptions: ${pending.length}`);

  const BATCH = 200;
  let done = 0;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);

    // Build VALUES clause + params
    const valueParts = [];
    const params = [];
    let p = 1;

    for (const b of batch) {
      const year = b.incorporation_date
        ? new Date(b.incorporation_date).getFullYear()
        : null;
      const capital = b.authorized_capital
        ? `₹${(Number(b.authorized_capital) / 100000).toFixed(1)} L`
        : null;

      const parts = [];
      parts.push(
        `${b.company_name} is a ${(b.company_class || "private").toLowerCase()} company`
      );
      if (b.sector)
        parts[0] += ` operating in the ${b.sector.toLowerCase()} sector`;
      if (b.city)
        parts[0] += `, based in ${b.city}${b.state ? `, ${b.state}` : ""}.`;
      else parts[0] += ".";

      if (year) parts.push(`Incorporated in ${year}.`);
      if (capital) parts.push(`Authorized capital: ${capital}.`);
      parts.push(
        "Financial details and traction metrics have not been provided by the business owner."
      );

      const description = parts.join(" ");
      const tagline = b.sector
        ? `${b.sector} company${b.city ? ` in ${b.city}` : ""}`
        : null;

      const provenance = {
        ...(typeof b.field_provenance === "object" && b.field_provenance
          ? b.field_provenance
          : {}),
        description: {
          source: "template",
          tier: "generated",
          updated: new Date().toISOString().slice(0, 10),
        },
      };

      valueParts.push(
        `($${p}::uuid, $${p + 1}::text, $${p + 2}::text, $${p + 3}::jsonb)`
      );
      params.push(b.id, description, tagline, JSON.stringify(provenance));
      p += 4;
    }

    const sql = `
      UPDATE businesses AS b
      SET description = v.description,
          tagline = COALESCE(b.tagline, v.tagline),
          field_provenance = v.provenance,
          updated_at = NOW()
      FROM (VALUES ${valueParts.join(", ")}) AS v(id, description, tagline, provenance)
      WHERE b.id = v.id
    `;

    try {
      await pool.query(sql, params);
      done += batch.length;
      if (done % 500 === 0 || done === pending.length) {
        console.log(`[descriptions] ${done}/${pending.length}`);
      }
    } catch (err) {
      console.error(`Batch failed at offset ${i}: ${err.message}`);
      // Fall back to per-row for this batch
      for (const b of batch) {
        try {
          await generateDescription(b);
          done++;
        } catch {}
      }
    }
  }

  console.log(`✓ Descriptions: ${done}/${pending.length}\n`);
}

  // ─── PHASE 2: Wikidata (SPARQL, 1 req/sec) ──────────
  if (PHASE === "all" || PHASE === "wikidata") {
    console.log("=== Phase 2: Wikidata ===");
    let done = 0, hits = 0;
    for (const b of rows) {
      const result = await fetchWikidata(b);
      if (result === "hit") hits++;
      done++;
      if (done % 50 === 0) {
        const pct = ((done / rows.length) * 100).toFixed(1);
        console.log(`[wikidata] ${done}/${rows.length} (${pct}%) | hits: ${hits}`);
      }
      await sleep(WIKIDATA_DELAY_MS);
    }
    console.log(`✓ Wikidata: ${done}/${rows.length}, hits: ${hits}\n`);
  }

  // ─── PHASE 3: Logos (fast, no rate limit) ───────────
  if (PHASE === "all" || PHASE === "logos") {
    console.log("=== Phase 3: Logos ===");
    // Re-fetch since Wikidata may have populated website_url
    const { rows: refreshed } = await pool.query(
      `SELECT id, website_url, logo_url FROM businesses
       WHERE ${INVESTABLE_WHERE} AND website_url IS NOT NULL AND logo_url IS NULL`
    );
    console.log(`Businesses with website but no logo: ${refreshed.length}`);
    for (const b of refreshed) {
      await fetchLogo(b);
    }
    console.log(`✓ Logos: ${refreshed.length}\n`);
  }

  // ─── PHASE 4: Directors (top tier only) ─────────────
  if (PHASE === "all" || PHASE === "directors") {
    console.log("=== Phase 4: Directors (large + listed only) ===");
    const topTier = rows.filter(
      (b) =>
        b.listing_status === "Listed" ||
        Number(b.authorized_capital) >= 100000000
    );
    console.log(`Top-tier businesses: ${topTier.length}`);
    let done = 0;
    for (const b of topTier) {
      await fetchDirectors(b);
      done++;
      if (done % 20 === 0) {
        console.log(`[directors] ${done}/${topTier.length}`);
      }
      await sleep(PORTAL_DELAY_MS);
    }
    console.log(`✓ Directors: ${done}/${topTier.length}\n`);
  }

  console.log("=== All phases done ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});