import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

runJob("fix-compound-values", async () => {
  const sectors = await db.execute(sql`
    UPDATE businesses
    SET sector = LOWER(TRIM(SPLIT_PART(sector, '/', 1)))
    WHERE is_external = true AND sector LIKE '%/%'
  `);

  const cities = await db.execute(sql`
    UPDATE businesses
    SET city = LOWER(TRIM(SPLIT_PART(city, ',', 1)))
    WHERE is_external = true AND city LIKE '%,%'
  `);

  return {
    sectorsFixed: sectors.rowCount ?? 0,
    citiesFixed: cities.rowCount ?? 0,
  };
});