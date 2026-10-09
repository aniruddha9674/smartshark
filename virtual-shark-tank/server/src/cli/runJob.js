import dotenv from "dotenv";
dotenv.config();

import { pool } from "../config/db.postgres.js";
import { logger } from "../config/logger.js";

/**
 * Wrap a script's body with common CLI concerns:
 * - dotenv is loaded
 * - pool is closed on exit
 * - errors are logged with context
 * - duration is tracked
 * - exit code is set correctly
 *
 * @param {string} name - job name for logging
 * @param {(ctx: { args: string[], flags: Set<string> }) => Promise<any>} fn
 */
export const runJob = async (name, fn) => {
  const started = Date.now();
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  logger.info({ job: name, args: positional, flags: [...flags] }, "Job started");

  try {
    const result = await fn({ args: positional, flags });
    const durationMs = Date.now() - started;
    logger.info({ job: name, durationMs, result }, "Job complete");
    await pool.end();
    process.exit(0);
  } catch (err) {
    logger.error(
      { job: name, err: err.message, stack: err.stack },
      "Job failed"
    );
    await pool.end();
    process.exit(1);
  }
};

/**
 * Parse a positional arg as an integer, with a fallback.
 */
export const intArg = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Require a positional arg or exit with a usage message.
 */
export const requireArg = (value, name, usage) => {
  if (!value) {
    console.error(`Missing required argument: ${name}`);
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  return value;
};