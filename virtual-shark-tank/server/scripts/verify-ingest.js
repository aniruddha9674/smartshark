import dotenv from "dotenv";
dotenv.config();

import { pool } from "../src/config/db.postgres.js";

const q = async (label, sql, params = []) => {
  const r = await pool.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.table(r.rows);
};

async function main() {
  await q(
    "Total MCA businesses",
    `SELECT COUNT(*)::int AS total FROM businesses WHERE data_source = 'mca'`
  );

  await q(
    "By status",
    `SELECT company_status, COUNT(*)::int AS n
     FROM businesses
     WHERE data_source = 'mca'
     GROUP BY company_status
     ORDER BY n DESC`
  );

  await q(
    "Coverage",
    `SELECT
       COUNT(*) FILTER (WHERE pincode IS NOT NULL)::int AS with_pincode,
       COUNT(*) FILTER (WHERE city IS NOT NULL)::int AS with_city,
       COUNT(*) FILTER (WHERE sector IS NOT NULL)::int AS with_sector,
       COUNT(*) FILTER (WHERE authorized_capital IS NOT NULL)::int AS with_capital,
       COUNT(*) FILTER (WHERE incorporation_date IS NOT NULL)::int AS with_date,
       COUNT(*)::int AS total
     FROM businesses
     WHERE data_source = 'mca'`
  );

  await q(
    "Top 10 cities",
    `SELECT city, COUNT(*)::int AS n
     FROM businesses
     WHERE data_source = 'mca' AND city IS NOT NULL
     GROUP BY city
     ORDER BY n DESC
     LIMIT 10`
  );

  await q(
    "Top 10 sectors",
    `SELECT sector, COUNT(*)::int AS n
     FROM businesses
     WHERE data_source = 'mca' AND sector IS NOT NULL
     GROUP BY sector
     ORDER BY n DESC
     LIMIT 10`
  );

  await q(
    "Active businesses by state",
    `SELECT state, COUNT(*)::int AS n
     FROM businesses
     WHERE data_source = 'mca' AND company_status = 'Active'
     GROUP BY state
     ORDER BY n DESC
     LIMIT 10`
  );

  await q(
    "Sample cards (active, has location + sector)",
    `SELECT
       cin,
       company_name,
       sector,
       city,
       state,
       pincode,
       company_status,
       authorized_capital,
       incorporation_date
     FROM businesses
     WHERE data_source = 'mca'
       AND company_status = 'Active'
       AND pincode IS NOT NULL
       AND sector IS NOT NULL
     ORDER BY RANDOM()
     LIMIT 10`
  );

  await q(
    "Oldest 5 active companies",
    `SELECT company_name, sector, city, incorporation_date, authorized_capital
     FROM businesses
     WHERE data_source = 'mca'
       AND company_status = 'Active'
       AND incorporation_date IS NOT NULL
     ORDER BY incorporation_date ASC
     LIMIT 5`
  );

  await q(
    "Newest 5 active companies",
    `SELECT company_name, sector, city, incorporation_date, authorized_capital
     FROM businesses
     WHERE data_source = 'mca'
       AND company_status = 'Active'
       AND incorporation_date IS NOT NULL
     ORDER BY incorporation_date DESC
     LIMIT 5`
  );

  await q(
    "Raw records count",
    `SELECT COUNT(*)::int AS total FROM raw_mca_records`
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});