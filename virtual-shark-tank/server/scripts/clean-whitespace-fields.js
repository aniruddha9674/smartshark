import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const r = await db.execute(sql`
  UPDATE businesses
  SET shop_act_license = NULLIF(TRIM(shop_act_license), ''),
      gst_number = NULLIF(TRIM(gst_number), ''),
      udyam_number = NULLIF(TRIM(udyam_number), '')
  WHERE TRIM(COALESCE(shop_act_license, '')) = ''
     OR TRIM(COALESCE(gst_number, '')) = ''
     OR TRIM(COALESCE(udyam_number, '')) = ''
`);

console.log("Cleaned:", r.rowCount);
await pool.end();