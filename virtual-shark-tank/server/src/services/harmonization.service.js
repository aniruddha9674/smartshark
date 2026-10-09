import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, and, isNull, sql,inArray } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  businesses,
  importBatches,
  rawImportBusinesses,
  harmonizationErrors,
  users,
} from "../models/postgres/index.js";
import { applyTransform } from "./transforms.js";
import { ApiError } from "../utils/apiError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CROSSWALKS_DIR = path.resolve(__dirname, "../../config/crosswalks");

// ─── Load crosswalks ─────────────────────────────────────────────
const crosswalkCache = new Map();

const loadCrosswalk = (sourceName) => {
  if (crosswalkCache.has(sourceName)) {
    return crosswalkCache.get(sourceName);
  }
  const filePath = path.join(CROSSWALKS_DIR, `${sourceName}.json`);
  if (!fs.existsSync(filePath)) {
    throw ApiError.badRequest(`No crosswalk found for source: ${sourceName}`);
  }
  const cw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  crosswalkCache.set(sourceName, cw);
  return cw;
};

// ─── System user (owns all imported businesses) ─────────────────
const SYSTEM_EMAIL = "system@smartshark.internal";

const getSystemUserId = async () => {
  const [system] = await db
    .select()
    .from(users)
    .where(eq(users.email, SYSTEM_EMAIL))
    .limit(1);

  if (system) return system.id;

  const [created] = await db
    .insert(users)
    .values({
      name: "SmartShark System",
      email: SYSTEM_EMAIL,
      passwordHash: "$2b$12$system-no-login",
      role: "admin",
      isVerified: true,
      isActive: false,
      isProfileComplete: true,
    })
    .returning();

  return created.id;
};

// ─── Validation ─────────────────────────────────────────────────
const validateField = (fieldName, value, rules) => {
  if (!rules) return null;

  if (rules.required && (value === undefined || value === null || value === "")) {
    return `Field "${fieldName}" is required but missing`;
  }

  if (value === undefined || value === null || value === "") return null;

  const str = String(value);
  if (rules.minLength && str.length < rules.minLength) {
    return `Field "${fieldName}" is shorter than minLength ${rules.minLength}`;
  }
  if (rules.maxLength && str.length > rules.maxLength) {
    return `Field "${fieldName}" exceeds maxLength ${rules.maxLength}`;
  }

  if (rules.type === "number" && typeof value !== "number") {
    return `Field "${fieldName}" must be a number`;
  }
  if (rules.type === "integer" && !Number.isInteger(value)) {
    return `Field "${fieldName}" must be an integer`;
  }
  if (rules.min !== undefined && typeof value === "number" && value < rules.min) {
    return `Field "${fieldName}" is below min ${rules.min}`;
  }
  if (rules.max !== undefined && typeof value === "number" && value > rules.max) {
    return `Field "${fieldName}" exceeds max ${rules.max}`;
  }

  return null;
};

// ─── Row mapping ────────────────────────────────────────────────
const mapRow = (rawRow, crosswalk) => {
  const mapped = {};
  const errors = [];

  for (const [sourceField, mapping] of Object.entries(crosswalk.fieldMappings)) {
    const rawValue = rawRow[sourceField];

    let transformed;
    try {
      transformed =
        typeof mapping === "string"
          ? rawValue
          : applyTransform(mapping.transform, rawValue, rawRow);
    } catch (err) {
      errors.push({
        errorType: "transform_failed",
        fieldName: mapping.field || sourceField,
        message: err.message,
      });
      continue;
    }

    const targetField = typeof mapping === "string" ? mapping : mapping.field;
    if (transformed !== undefined) {
      mapped[targetField] = transformed;
    }
  }

  // Apply defaults
  Object.assign(mapped, crosswalk.defaults || {});

  // Validate
  for (const [field, rules] of Object.entries(crosswalk.validators || {})) {
    const err = validateField(field, mapped[field], rules);
    if (err) {
      errors.push({
        errorType: rules.required ? "missing_required" : "invalid_format",
        fieldName: field,
        message: err,
      });
    }
  }

  return { mapped, errors };
};

// ─── Main harmonization function ────────────────────────────────
export const harmonizeBatch = async (batchId, { batchSize = 500 } = {}) => {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);

  if (!batch) throw ApiError.notFound("Batch not found");
  if (batch.status === "done") {
    throw ApiError.badRequest("Batch already harmonized");
  }

  const crosswalk = loadCrosswalk(batch.sourceName);
  const systemUserId = await getSystemUserId();

  await db
    .update(importBatches)
    .set({ status: "harmonizing" })
    .where(eq(importBatches.id, batchId));

  const totals = { processed: 0, inserted: 0, skipped: 0, errored: 0 };
  const seenKeys = new Set();

  while (true) {
    const rawRows = await db
      .select()
      .from(rawImportBusinesses)
      .where(
        and(
          eq(rawImportBusinesses.batchId, batchId),
          isNull(rawImportBusinesses.processedAt)
        )
      )
      .orderBy(rawImportBusinesses.sourceRowIndex)
      .limit(batchSize);

    if (rawRows.length === 0) break;

    const businessesToInsert = [];
    const errorsToInsert = [];
    const rawIdsToMark = rawRows.map((r) => r.id);

    for (const raw of rawRows) {
      const { mapped, errors } = mapRow(raw.rawData, crosswalk);

      if (errors.length > 0) {
        for (const e of errors) {
          errorsToInsert.push({
            batchId,
            rawRowId: raw.id,
            errorType: e.errorType,
            fieldName: e.fieldName,
            message: e.message,
            rawData: raw.rawData,
          });
        }
        totals.errored++;
        continue;
      }

      const dedupeKey = crosswalk.dedupeKey;
      if (dedupeKey && mapped[dedupeKey]) {
        const normalized = String(mapped[dedupeKey]).trim().toLowerCase();
        if (seenKeys.has(normalized)) {
          errorsToInsert.push({
            batchId,
            rawRowId: raw.id,
            errorType: "duplicate",
            fieldName: dedupeKey,
            message: `Duplicate ${dedupeKey}: "${mapped[dedupeKey]}"`,
            rawData: raw.rawData,
          });
          totals.skipped++;
          continue;
        }
        seenKeys.add(normalized);
      }

      businessesToInsert.push({
        ...mapped,
        ownerId: systemUserId,
        sourceBatchId: batchId,
        sourceRowId: raw.id,
      });
    }

    await db.transaction(async (tx) => {
      if (businessesToInsert.length > 0) {
        try {
          await tx.insert(businesses).values(businessesToInsert);
          totals.inserted += businessesToInsert.length;
        } catch (err) {
          // Fallback: insert one by one so we can log which row failed
          for (const b of businessesToInsert) {
            try {
              await tx.insert(businesses).values(b);
              totals.inserted++;
            } catch (innerErr) {
              errorsToInsert.push({
                batchId,
                rawRowId: b.sourceRowId,
                errorType: "insert_failed",
                fieldName: null,
                message: innerErr.message,
                rawData: null,
              });
              totals.errored++;
            }
          }
        }
      }

      if (errorsToInsert.length > 0) {
        await tx.insert(harmonizationErrors).values(errorsToInsert);
      }

      await tx
        .update(rawImportBusinesses)
        .set({ processedAt: new Date() })
        .where(inArray(rawImportBusinesses.id, rawIdsToMark));
    });

    totals.processed += rawRows.length;

    if (rawRows.length < batchSize) break;
  }

  const [updated] = await db
    .update(importBatches)
    .set({
      status: "done",
      processedRows: totals.processed,
      failedRows: totals.errored,
      completedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId))
    .returning();

  return { batch: updated, stats: totals };
};

export const listHarmonizationErrors = async (batchId, { limit = 50 } = {}) => {
  return db
    .select()
    .from(harmonizationErrors)
    .where(eq(harmonizationErrors.batchId, batchId))
    .orderBy(sql`${harmonizationErrors.createdAt} DESC`)
    .limit(limit);
};