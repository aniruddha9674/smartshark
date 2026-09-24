import { cleanupOldNotifications } from "../services/notification.service.js";
import { logger } from "../config/logger.js";

const RETENTION_DAYS = 90;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Run once immediately, then every 24h.
 * Safe to call multiple times — the cleanup is idempotent.
 */
export const scheduleNotificationCleanup = () => {
  const run = async () => {
    try {
      const result = await cleanupOldNotifications(RETENTION_DAYS);
      logger.info(
        { deleted: result.deleted, cutoff: result.cutoff },
        "Notification cleanup complete"
      );
    } catch (err) {
      logger.error({ err }, "Notification cleanup failed");
    }
  };

  // Run once shortly after startup, then daily
  setTimeout(run, 30 * 1000);
  setInterval(run, ONE_DAY_MS);
};