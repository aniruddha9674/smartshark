import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import {
  businesses,
  pitches,
  rawImportBusinesses,
} from "../src/models/postgres/index.js";
import { eq, isNotNull, and } from "drizzle-orm";

runJob("seed-external-pitches", async () => {
  const rows = await db
    .select({
      business: businesses,
      raw: rawImportBusinesses.rawData,
    })
    .from(businesses)
    .leftJoin(
      rawImportBusinesses,
      eq(rawImportBusinesses.id, businesses.sourceRowId)
    )
    .where(
      and(
        eq(businesses.isExternal, true),
        isNotNull(businesses.fundingAsk)
      )
    );

  const existing = await db
    .select({ businessId: pitches.businessId })
    .from(pitches);
  const hasPitch = new Set(existing.map((p) => p.businessId));

  const toCreate = rows.filter((r) => !hasPitch.has(r.business.id));

  if (toCreate.length === 0) {
    return { created: 0, skipped: rows.length };
  }

  const num = (v) => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const valid = [];
  const rejected = [];

  for (const { business: b, raw } of toCreate) {
    const askLakhs = num(raw?.["Original Ask Amount"]);
    const equityPct = num(raw?.["Original Offered Equity"]);
    const valuationLakhs = num(raw?.["Valuation Requested"]);
    const description = raw?.["Business Description"]?.trim();

    const askAmount = askLakhs
      ? Math.round(askLakhs * 100000)
      : Number(b.fundingAsk);

    const equityOffered =
      equityPct && equityPct > 0 && equityPct <= 100 ? equityPct : 10;

    const valuation =
      valuationLakhs && valuationLakhs > 0
        ? Math.round(valuationLakhs * 100000)
        : Math.round(askAmount / (equityOffered / 100));

    // Skip rows that would violate CHECK constraints
    if (!askAmount || askAmount <= 0) {
      rejected.push({ name: b.companyName, reason: `askAmount=${askAmount}` });
      continue;
    }
    if (!equityOffered || equityOffered <= 0 || equityOffered > 100) {
      rejected.push({ name: b.companyName, reason: `equity=${equityOffered}` });
      continue;
    }

    const title = raw?.["Startup Name"] || b.companyName;

    valid.push({
      businessId: b.id,
      title: `${title} — Pitch`,
      tagline: description?.slice(0, 200) || `${b.sector} · ${b.city}`,
      shortPitch: description?.slice(0, 500) || "",
      longSummary: description || "",
      askAmount,
      equityOffered,
      valuation,
      status: "live",
      publishedAt: new Date(),
    });
  }

  const BATCH = 200;
  let created = 0;
  let failedBatches = 0;

  for (let i = 0; i < valid.length; i += BATCH) {
    const chunk = valid.slice(i, i + BATCH);
    try {
      const result = await db
        .insert(pitches)
        .values(chunk)
        .returning({ id: pitches.id });
      created += result.length;
    } catch (err) {
      failedBatches++;
      console.error(`[seed] batch ${i / BATCH} failed: ${err.message}`);
      // Retry row by row so one bad row doesn't kill the batch
      for (const row of chunk) {
        try {
          await db.insert(pitches).values(row).returning({ id: pitches.id });
          created++;
        } catch (rowErr) {
          rejected.push({
            name: row.title,
            reason: rowErr.message.slice(0, 120),
          });
        }
      }
    }
  }

  if (rejected.length > 0) {
    console.log("\nRejected rows:");
    console.table(rejected.slice(0, 20));
  }

  return {
    created,
    rejected: rejected.length,
    failedBatches,
    totalCandidates: valid.length,
  };
});