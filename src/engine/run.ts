import pool  from "../configs/client.js";
import { withMerchantContext } from "./withMerchantContext.js";
import { processTransaction, MatchOutcome } from "./matcher.js";
import { TransactionRow } from "./types.js";

async function run() {
  const { rows: merchants } = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM merchants"
  );

  const outcomes: MatchOutcome[] = [];

  for (const merchant of merchants) {
    const unmatched = await withMerchantContext(merchant.id, async (client) => {
      const { rows } = await client.query<TransactionRow>(
        `SELECT id, merchant_id, amount, sender_name, narration, occurred_at
         FROM transactions
         WHERE merchant_id = $1 AND match_status = 'unmatched'
         ORDER BY occurred_at`,
        [merchant.id]
      );
      return rows;
    });

    console.log(`\n${merchant.name}: ${unmatched.length} unmatched transaction(s)`);

    for (const txn of unmatched) {
      // one withMerchantContext (= one DB transaction) per row, so a failure
      // on one transaction doesn't roll back everything else in the batch
      const outcome = await withMerchantContext(merchant.id, (client) =>
        processTransaction(client, txn)
      );
      outcomes.push(outcome);

      const winnerNote = outcome.winner
        ? `  [${outcome.winner.match_type}, score=${outcome.winner.score}]`
        : "";
      console.log(
        `  ${txn.id.slice(0, 8)}  ₦${Number(txn.amount).toLocaleString()}  "${txn.sender_name}"  -> ${outcome.decision}${winnerNote}`
      );
    }
  }

  const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.decision] = (acc[o.decision] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\nSummary:", summary);
  await pool.end();
}

run().catch((err) => {
  console.error("Matching run failed:", err);
  process.exit(1);
});
