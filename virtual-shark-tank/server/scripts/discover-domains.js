import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";
import dns from "node:dns/promises";

const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 25;
const SLEEP_BETWEEN = Number(process.env.SLEEP_BETWEEN) || 400;
const MAX_TIER = Number(process.env.MAX_TIER) || 5000;
const MIN_CAPITAL = Number(process.env.MIN_CAPITAL) || 0;

const PIPEWORX_TIMEOUT = 10000;
const DNS_TIMEOUT = 3000;
const FETCH_TIMEOUT = 8000;

const NOISE = new Set([
  "private", "pvt", "limited", "ltd", "llp", "opc", "india", "indian",
  "the", "and", "of", "co", "company", "corporation", "corp", "inc",
  "technologies", "technology", "solutions", "services", "systems",
]);

function nameTokens(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && !NOISE.has(w));
}

async function domainResolves(host) {
  try {
    await Promise.race([
      dns.lookup(host),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dns timeout")), DNS_TIMEOUT)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function pageMentionsCompany(host, tokens) {
  try {
    const res = await fetch(`https://${host}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartSharkBot/1.0)" },
    });
    if (!res.ok) return false;
    const html = (await res.text()).toLowerCase().slice(0, 200_000);
    return tokens.some((t) => html.includes(t));
  } catch {
    return false;
  }
}

async function tryPipeworx(name, city) {
  try {
    const res = await fetch("https://gateway.pipeworx.io/v1/tools/resolve_domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, city: city || undefined }),
      signal: AbortSignal.timeout(PIPEWORX_TIMEOUT),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const best = (data.candidates || []).find((c) => c.domain);
    return best?.domain || null;
  } catch {
    return null;
  }
}

async function verifyDomain(domain, companyName) {
  if (!domain) return { status: "failed", reason: "no_domain" };
  const host = domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();

  if (!(await domainResolves(host))) {
    return { status: "failed", reason: "dns_fail" };
  }

  const tokens = nameTokens(companyName);
  if (tokens.length === 0) return { status: "skipped", reason: "no_tokens" };

  if (!(await pageMentionsCompany(host, tokens))) {
    return { status: "failed", reason: "content_mismatch" };
  }

  return { status: "found", domain: host };
}

async function runBatch() {
  // Top-down: highest authorized capital first, then oldest incorporation
  const { rows } = await pool.query(
    `SELECT id, cin, company_name, city, authorized_capital
     FROM businesses
     WHERE data_source = 'mca'
       AND company_status = 'Active'
       AND domain_discovery_status = 'pending'
       AND website_url IS NULL
       AND authorized_capital >= $1
     ORDER BY authorized_capital DESC NULLS LAST, incorporation_date DESC NULLS LAST
     LIMIT $2`,
    [MIN_CAPITAL, BATCH_SIZE]
  );

  if (rows.length === 0) return { processed: 0, found: 0, failed: 0, skipped: 0 };

  let found = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const start = Date.now();

    const candidate = await tryPipeworx(b.company_name, b.city);
    const verdict = await verifyDomain(candidate, b.company_name);
    const elapsed = Date.now() - start;

    const capital = b.authorized_capital
      ? `₹${(Number(b.authorized_capital) / 100000).toFixed(0)}L`
      : "₹?";

    if (verdict.status === "found") {
      await pool.query(
        `UPDATE businesses
         SET website_url = $1, domain_discovery_status = 'found',
             domain_discovery_attempted_at = NOW(), domain_discovery_reason = NULL
         WHERE id = $2`,
        [verdict.domain, b.id]
      );
      found++;
      console.log(`  ✓ [${i + 1}/${rows.length}] ${capital} | ${b.company_name.slice(0, 40)} → ${verdict.domain} (${elapsed}ms)`);
    } else {
      await pool.query(
        `UPDATE businesses
         SET domain_discovery_status = $1, domain_discovery_attempted_at = NOW(),
             domain_discovery_reason = $2
         WHERE id = $3`,
        [verdict.status, verdict.reason, b.id]
      );
      if (verdict.status === "failed") failed++;
      else skipped++;
      console.log(`  ✗ [${i + 1}/${rows.length}] ${capital} | ${b.company_name.slice(0, 40)} (${verdict.reason}, ${elapsed}ms)`);
    }

    await new Promise((r) => setTimeout(r, SLEEP_BETWEEN));
  }

  return { processed: rows.length, found, failed, skipped };
}

async function main() {
  console.log(`Continuous domain discovery (top-down by capital)`);
  console.log(`  Batch size:     ${BATCH_SIZE}`);
  console.log(`  Max tier:       ${MAX_TIER} (process top ${MAX_TIER} by capital)`);
  console.log(`  Min capital:    ₹${MIN_CAPITAL}`);
  console.log(`  Timeouts:       pipeworx=${PIPEWORX_TIMEOUT}ms dns=${DNS_TIMEOUT}ms fetch=${FETCH_TIMEOUT}ms\n`);

  await pool.query("SELECT 1");
  console.log("✓ DB connected\n");

  let totalProcessed = 0;
  let totalFound = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const t0 = Date.now();
  let batchNum = 0;

  while (true) {
    batchNum++;
    const result = await runBatch();

    if (result.processed === 0) {
      console.log("\n✓ No more pending businesses");
      break;
    }

    totalProcessed += result.processed;
    totalFound += result.found;
    totalFailed += result.failed;
    totalSkipped += result.skipped;

    if (totalProcessed >= MAX_TIER) {
      console.log(`\n✓ Reached tier limit of ${MAX_TIER}`);
      break;
    }

    const elapsedMin = (Date.now() - t0) / 1000 / 60;
    const rate = totalProcessed / (elapsedMin || 1);
    const eta = ((MAX_TIER - totalProcessed) / (rate || 1)).toFixed(0);

    console.log(
      `[batch ${batchNum}] total: ${totalProcessed}/${MAX_TIER} | found: ${totalFound} (${((totalFound / totalProcessed) * 100).toFixed(1)}%) | failed: ${totalFailed} | ${rate.toFixed(0)}/min | ETA ${eta}min\n`
    );
  }

  const elapsedMin = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\n=== DONE ===`);
  console.log(`  Processed: ${totalProcessed}`);
  console.log(`  Found:     ${totalFound} (${((totalFound / totalProcessed) * 100).toFixed(1)}%)`);
  console.log(`  Failed:    ${totalFailed}`);
  console.log(`  Skipped:   ${totalSkipped}`);
  console.log(`  Time:      ${elapsedMin} minutes`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});