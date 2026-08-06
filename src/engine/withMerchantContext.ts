import { PoolClient } from "pg";
import pool from "../configs/client.js";

/**
 * Runs `fn` with a Postgres client that has app.merchant_id set for the
 * duration of one transaction. RLS policies check every row against this
 * value, so queries inside fn only ever see that merchant's data — even
 * if the query itself forgets a WHERE merchant_id = ... clause.
 *
 * SET LOCAL scopes the setting to the current transaction only, so it
 * can't leak onto the next request that happens to reuse this pooled
 * connection.
 */
export async function withMerchantContext<T>(
  merchantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
