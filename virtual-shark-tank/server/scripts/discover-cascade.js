import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";
import dns from "node:dns/promises";

// ─── Config ────────────────────────────────────────────────
const MAX_TIER = Number(process.env.MAX_TIER) || 5000;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 3;
const DNS_TIMEOUT = 2500;
const FETCH_TIMEOUT = 6000;

const REJECT_DOMAINS = new Set([
  "tracxn.com", "leadiq.com", "investing.com", "zaubacorp.com",
  "instafinancials.com", "thecompanycheck.com", "indiafilings.com",
  "tofler.in", "crunchbase.com", "signalhire.com", "rocketreach.co",
  "ambitionbox.com", "glassdoor.com", "justdial.com", "indiamart.com",
  "linkedin.com", "facebook.com", "wikipedia.org", "bloomberg.com",
  "moneycontrol.com", "economictimes.com", "business-standard.com",
  "thehindu.com", "timesofindia.indiatimes.com", "ndtv.com",
  "instagram.com", "twitter.com", "x.com", "youtube.com",
  "companiesnext.com", "quickcompany.in", "cleartax.in", "vakilsearch.com",
  "startupindia.gov.in", "msme.gov.in", "gst.gov.in", "mca.gov.in",
]);

const NOISE = new Set([
  "private", "pvt", "limited", "ltd", "llp", "opc", "india", "indian",
  "the", "and", "of", "co", "company", "corporation", "corp", "inc",
  "technologies", "technology", "solutions", "services", "systems",
  "development", "centre", "center", "innovation", "enterprises",
  "industries", "group", "holdings", "ventures", "associates",
]);

const GENERIC = new Set([
  "shree", "shri", "sri", "jai", "bharat", "village", "city", "metro",
  "urban", "rural", "district", "national", "state", "central", "regional",
  "local", "new", "old", "modern", "prime", "star", "global", "universal",
  "united", "general", "standard", "royal", "grand", "golden", "green",
  "blue", "red", "sun", "max", "apex", "summit", "first", "top", "best",
  "supreme", "smart", "next", "future",
]);

// ─── Circuit Breakers ──────────────────────────────────────
class CircuitBreaker {
  constructor(name, threshold = 3) {
    this.name = name;
    this.threshold = threshold;
    this.failures = 0;
    this.open = false;
  }
  recordSuccess() { this.failures = 0; }
  recordFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.open = true;
      console.log(`  ⚡ Circuit OPEN for ${this.name} (${this.failures} consecutive failures)`);
    }
  }
  isOpen() { return this.open; }
}
const pipeworxBreaker = new CircuitBreaker("pipeworx", 3);
const clearoutBreaker = new CircuitBreaker("clearout", 5);

// ─── Name Tokenization ─────────────────────────────────────
function brandCandidates(companyName) {
  const cleaned = companyName.replace(/[^\w\s]/g, "").toUpperCase();
  const tokens = cleaned
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !GENERIC.has(w));
  return [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, 3);
}

function allNameTokens(companyName) {
  return companyName
    .toUpperCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !NOISE.has(w));
}

// ─── Verification Gate (shared by all layers) ──────────────
async function dnsResolves(host) {
  try {
    await Promise.race([
      dns.lookup(host),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), DNS_TIMEOUT)),
    ]);
    return true;
  } catch { return false; }
}

async function fetchPageText(host) {
  try {
    const res = await fetch(`https://${host}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartSharkBot/1.0)" },
    });
    if (!res.ok) return null;
    return (await res.text()).toLowerCase().slice(0, 200_000);
  } catch { return null; }
}

async function verifyDomain(domain, companyName, businessId) {
  if (!domain) return { ok: false, reason: "no_domain" };
  const host = domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();

  const base = host.split(".").slice(-2).join(".");
  if (REJECT_DOMAINS.has(base)) return { ok: false, reason: "rejected_aggregator" };

  if (!(await dnsResolves(host))) return { ok: false, reason: "dns_fail" };

  const html = await fetchPageText(host);
  if (!html) return { ok: false, reason: "fetch_fail" };

  const tokens = allNameTokens(companyName);
  if (tokens.length === 0) return { ok: false, reason: "no_tokens" };
  if (!tokens.some((t) => html.includes(t))) return { ok: false, reason: "content_mismatch" };

  // Collision check: is this domain already claimed by another business?
  const collision = await pool.query(
    `SELECT id FROM businesses WHERE website_url = $1 AND id != $2 LIMIT 1`,
    [host, businessId]
  );
  if (collision.rows.length > 0) return { ok: false, reason: "collision" };

  return { ok: true, host };
}

// ─── Layer 1: Brand Probe (free, unlimited) ────────────────
async function brandProbe(companyName) {
  const brands = brandCandidates(companyName);
  if (brands.length === 0) return null;

  // Build candidate domains for all brand tokens
  const candidates = [];
  for (const brand of brands) {
    candidates.push(`${brand}.com`, `${brand}.in`, `${brand}.co.in`);
  }

  // Fast DNS check on all candidates in parallel — only proceed for ones that resolve
  const dnsResults = await Promise.all(
    candidates.map(async (d) => ({ domain: d, ok: await dnsResolves(d) }))
  );
  const live = dnsResults.filter((r) => r.ok).map((r) => r.domain);

  for (const domain of live) {
    const html = await fetchPageText(domain);
    if (!html) continue;
    const tokens = allNameTokens(companyName);
    if (tokens.some((t) => html.includes(t))) {
      return { domain };
    }
  }
  return null;
}

// ─── Layer 2: Clearout (famous brands) ─────────────────────
async function clearoutLookup(companyName) {
  if (clearoutBreaker.isOpen()) return null;
  try {
    const q = brandCandidates(companyName).join(" ") || companyName;
    const res = await fetch(
      `https://api.clearout.io/v2/public/companies/autocomplete?query=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) { clearoutBreaker.recordFailure(); return null; }
    const data = await res.json();
    const list = data.data || data.results || [];
    if (!Array.isArray(list) || list.length === 0) { clearoutBreaker.recordSuccess(); return null; }
    const best = list.sort((a, b) =>
      (b.confidence_score || b.confidence || 0) - (a.confidence_score || a.confidence || 0)
    )[0];
    clearoutBreaker.recordSuccess();
    return best?.domain ? { domain: best.domain } : null;
  } catch {
    clearoutBreaker.recordFailure();
    return null;
  }
}

// ─── Layer 3: Wikidata (authoritative, sparse) ─────────────
async function wikidataLookup(companyName) {
  const brand = brandCandidates(companyName)[0];
  if (!brand) return null;
  try {
    const sparql = `SELECT ?website WHERE {
      ?c rdfs:label ?label .
      FILTER(LCASE(STR(?label)) = "${brand}"@en)
      ?c wdt:P17 wd:Q668 .
      ?c wdt:P856 ?website .
    } LIMIT 1`;
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
        "User-Agent": "SmartShark/1.0 (educational)",
      },
      body: sparql,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const url = data.results?.bindings?.[0]?.website?.value;
    if (!url) return null;
    return { domain: new URL(url).hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

// ─── Layer 4: Pipeworx (last resort, circuit-broken) ───────
async function pipeworxLookup(companyName, city) {
  if (pipeworxBreaker.isOpen()) return null;
  try {
    const res = await fetch("https://gateway.pipeworx.io/v1/tools/resolve_domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: companyName, city: city || undefined }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { pipeworxBreaker.recordFailure(); return null; }
    const data = await res.json();
    const best = (data.candidates || []).find((c) => c.domain);
    pipeworxBreaker.recordSuccess();
    return best?.domain ? { domain: best.domain } : null;
  } catch {
    pipeworxBreaker.recordFailure();
    return null;
  }
}

// ─── Orchestrator ──────────────────────────────────────────
async function discoverDomain(business) {
  const layers = [
    { name: "brand_probe", fn: () => brandProbe(business.company_name) },
    { name: "clearout", fn: () => clearoutLookup(business.company_name) },
    { name: "wikidata", fn: () => wikidataLookup(business.company_name) },
    { name: "pipeworx", fn: () => pipeworxLookup(business.company_name, business.city) },
  ];

  for (const layer of layers) {
    try {
      const result = await layer.fn();
      if (!result?.domain) continue;

      const verdict = await verifyDomain(result.domain, business.company_name, business.id);
      if (verdict.ok) {
        return { domain: verdict.host, source: layer.name };
      }
      // Verification failed — try next layer
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Main loop ─────────────────────────────────────────────
async function processOne(b) {
  const start = Date.now();
  const result = await discoverDomain(b);
  const elapsed = Date.now() - start;

  if (result) {
    await pool.query(
      `UPDATE businesses SET website_url = $1, domain_discovery_status = 'found',
         domain_discovery_attempted_at = NOW(), domain_discovery_reason = $2 WHERE id = $3`,
      [result.domain, `found:${result.source}`, b.id]
    );
    const capital = b.authorized_capital
      ? `₹${(Number(b.authorized_capital) / 100000).toFixed(0)}L`
      : "₹?";
    console.log(`  ✓ [${capital}] ${b.company_name.slice(0, 40)} → ${result.domain} (${result.source}, ${elapsed}ms)`);
    return { found: true, source: result.source };
  }

  await pool.query(
    `UPDATE businesses SET domain_discovery_status = 'failed',
       domain_discovery_attempted_at = NOW(), domain_discovery_reason = 'no_verified_domain' WHERE id = $1`,
    [b.id]
  );
  return { found: false };
}

async function main() {
  console.log(`Cascade domain discovery starting`);
  console.log(`  Max tier: ${MAX_TIER}, concurrency: ${CONCURRENCY}\n`);

  await pool.query("SELECT 1");
  console.log("✓ DB connected\n");

  let totalProcessed = 0;
  let totalFound = 0;
  const sourceCounts = { brand_probe: 0, clearout: 0, wikidata: 0, pipeworx: 0 };
  const t0 = Date.now();

  while (totalProcessed < MAX_TIER) {
    const remaining = MAX_TIER - totalProcessed;
    const batchSize = Math.min(CONCURRENCY, remaining);

    const { rows } = await pool.query(
      `SELECT id, cin, company_name, city, authorized_capital
       FROM businesses
       WHERE data_source = 'mca' AND company_status = 'Active'
         AND domain_discovery_status = 'pending' AND website_url IS NULL
         AND authorized_capital > 0
       ORDER BY authorized_capital DESC NULLS LAST
       LIMIT $1`,
      [batchSize]
    );

    if (rows.length === 0) {
      console.log("\n✓ No more pending businesses");
      break;
    }

    const results = await Promise.all(rows.map(processOne));

    for (const r of results) {
      if (r.found) {
        totalFound++;
        sourceCounts[r.source]++;
      }
    }
    totalProcessed += rows.length;

    const elapsedMin = (Date.now() - t0) / 1000 / 60;
    const rate = totalProcessed / (elapsedMin || 1);
    const eta = ((MAX_TIER - totalProcessed) / (rate || 1)).toFixed(0);
    console.log(
      `[${totalProcessed}/${MAX_TIER}] found: ${totalFound} (${((totalFound / totalProcessed) * 100).toFixed(1)}%) | ${rate.toFixed(0)}/min | ETA ${eta}min\n`
    );
  }

  console.log(`\n=== DONE ===`);
  console.log(`  Processed: ${totalProcessed}`);
  console.log(`  Found:     ${totalFound} (${((totalFound / totalProcessed) * 100).toFixed(1)}%)`);
  console.log(`  By source: ${JSON.stringify(sourceCounts)}`);
  console.log(`  Time:      ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);

  await pool.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });