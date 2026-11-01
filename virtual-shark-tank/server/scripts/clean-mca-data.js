import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";

const run = async () => {
  console.log("1. Nulling implausible incorporation dates (pre-1850)...");
  const r1 = await pool.query(`
    UPDATE businesses
    SET incorporation_date = NULL
    WHERE data_source = 'mca'
      AND incorporation_date IS NOT NULL
      AND EXTRACT(YEAR FROM incorporation_date) < 1850
  `);
  console.log(`   fixed: ${r1.rowCount}`);

  console.log("\n2. Normalizing city trailing punctuation...");
  const r2 = await pool.query(`
    UPDATE businesses
    SET city = TRIM(TRAILING '.' FROM TRIM(TRAILING ' ' FROM city))
    WHERE data_source = 'mca'
      AND city IS NOT NULL
      AND city LIKE '%.'
  `);
  console.log(`   fixed: ${r2.rowCount}`);

  console.log("\n3. Title-casing ALL-CAPS cities...");
  const r3 = await pool.query(`
    UPDATE businesses
    SET city = INITCAP(city)
    WHERE data_source = 'mca'
      AND city IS NOT NULL
      AND city = UPPER(city)
      AND LENGTH(city) > 2
  `);
  console.log(`   fixed: ${r3.rowCount}`);

  console.log("\n4. Final city top-10 check:");
  const r4 = await pool.query(`
    SELECT city, COUNT(*)::int AS n
    FROM businesses
    WHERE data_source = 'mca' AND city IS NOT NULL
    GROUP BY city
    ORDER BY n DESC
    LIMIT 10
  `);
  console.table(r4.rows);

  await pool.end();
};

run().catch((err) => { console.error(err); process.exit(1); });