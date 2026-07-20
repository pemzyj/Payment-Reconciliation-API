import { Pool } from "pg";
import "dotenv/config";

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/reconciliation",
});
