import { Pool } from "pg";


const pool = new Pool({
  connectionString:
    process.env.DATABASE_URI ??
    "postgresql://postgres:postgres@localhost:5432/reconciliation",
});

export default pool;
