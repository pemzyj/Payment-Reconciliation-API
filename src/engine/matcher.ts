// Now that I have confidence scores, what should I do?

import { PoolClient } from "pg"; // Using a pool client because reconciliation should run 
// inside one database transaction Otherwise PgSQL cannot guarantee atomicity
import { InvoiceCandidateRow, ScoredCandidate, TransactionRow } from "./types.js";
import { scoreAllCandidates } from "./scoring.js";
import { AUTO_MATCH_THRESHOLD, REVIEW_FLOOR, LOG_FLOOR } from "../configs/config.js";

/*
 Every open invoice for this transaction's merchant, with the raw signals
 each scoring function needs already computed in SQL (trigram similarity,
 days-off, substring check). No date filter here on purpose — an exact
 reference match shouldn't be missed just because the invoice is old;
 amount_time's own window check happens in the scoring layer instead.
*/
async function fetchCandidateInvoices(
  // retrieves every open invoice belonging to the merchant
  client: PoolClient,
  txn: TransactionRow
): Promise<InvoiceCandidateRow[]> {
  const { rows } = await client.query(
    `
    SELECT
      i.id AS invoice_id,
      i.amount AS invoice_amount,
      i.amount_paid,
      i.reference_code,
      i.due_date,
      c.name AS customer_name,
      (position(upper(i.reference_code) in upper($3)) > 0) AS ref_in_narration,
      abs($4::date - i.due_date) AS days_off,
      similarity(upper(trim($2)), upper(trim(c.name))) AS name_similarity
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.merchant_id = $1
      AND i.status IN ('pending', 'partial')
    `,
    [txn.merchant_id, txn.sender_name, txn.narration, txn.occurred_at]
  );
  return rows;
}

async function logAttempts(
  client: PoolClient,
  txn: TransactionRow,
  candidates: ScoredCandidate[]
) {
  for (const c of candidates) {
    if (c.score < LOG_FLOOR) continue;
    await client.query(
      `INSERT INTO match_attempts (transaction_id, invoice_id, merchant_id, match_type, score, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [txn.id, c.invoice_id, txn.merchant_id, c.match_type, c.score, JSON.stringify(c.reasoning)]
    );
  }
}

async function logNoMatch(client: PoolClient, txn: TransactionRow, reason: string) {
// This is valuable for auditing.
  await client.query(
    `INSERT INTO match_attempts (transaction_id, invoice_id, merchant_id, match_type, score, reasoning)
     VALUES ($1, NULL, $2, 'none', 0, $3)`,
    [txn.id, txn.merchant_id, JSON.stringify({ reason })]
  );
}

/*
  Applies a confirmed match: locks the invoice row (SELECT ... FOR UPDATE)
  so two transactions can't both credit the same invoice in a race, updates
  amount_paid/status, and links the transaction. This is the only place
  money actually moves, and it only ever runs for exact_reference winners
  above AUTO_MATCH_THRESHOLD.
*/
async function applyMatch(
  client: PoolClient,
  txn: TransactionRow,
  winner: ScoredCandidate
) {
  const { rows } = await client.query(
    `SELECT amount, amount_paid FROM invoices WHERE id = $1 FOR UPDATE`,
    [winner.invoice_id]
  );
  if (rows.length === 0) {
    // invoice vanished between candidate fetch and apply (e.g. deleted)
    // don't silently match against nothing, fall back to review.
    await logNoMatch(client, txn, "winning invoice no longer exists at apply time");
    await client.query(
      `UPDATE transactions SET match_status = 'needs_review' WHERE id = $1`,
      [txn.id]
    );
    return;
  }

  const invoiceAmount = Number(rows[0].amount);
  const amountPaid = Number(rows[0].amount_paid);
  const txnAmount = Number(txn.amount);
  const newPaid = amountPaid + txnAmount;
  const isFull = newPaid >= invoiceAmount - 0.005; // guard float rounding
  const newInvoiceStatus = isFull ? "matched" : "partial";
  const newTxnStatus = isFull ? "matched" : "partial";

  await client.query(
    `UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3`,
    [newPaid, newInvoiceStatus, winner.invoice_id]
  );

  await client.query(
    `UPDATE transactions SET matched_invoice_id = $1, match_status = $2 WHERE id = $3`,
    [winner.invoice_id, newTxnStatus, txn.id]
  );
}

export interface MatchOutcome {
  transaction_id: string;
  decision: "matched" | "partial" | "needs_review" | "unmatched";
  winner?: ScoredCandidate;
  candidate_count: number;
}

/*
 Picks the winning candidate by TIER first, score second — not a flat
 max-score across all match types.
 
 Today's score bands (exact_reference 0.93-0.99, amount_time <=0.75,
 fuzzy_name <=0.70) already keep exact_reference on top numerically, so a
 flat reduce() happens to give the same answer right now. But that
 correctness is *incidental* to the current constants in config.ts — if
 AUTO_MATCH_THRESHOLD or the fuzzy/amount_time formulas are ever retuned
 without someone noticing the gap has to stay open, a fuzzy_name hit could
 silently outscore a real exact_reference match and get treated as the
 stronger signal, when it categorically isn't: an explicit reference code
 a human typed in is not the same *kind* of evidence as a name that merely
 resembles a customer, no matter what the numbers say. Tier priority makes
 that invariant explicit instead of leaving it to hang on unstated distance
 between constants in a different file.
*/
function pickWinner(scored: ScoredCandidate[]): ScoredCandidate {
  const byType = (t: ScoredCandidate["match_type"]) =>
    scored.filter((c) => c.match_type === t);

  const best = (candidates: ScoredCandidate[]) =>
    candidates.reduce((a, b) => (b.score > a.score ? b : a));

  const exact = byType("exact_reference");
  if (exact.length > 0) return best(exact);

  const amountTime = byType("amount_time");
  if (amountTime.length > 0) return best(amountTime);

  return best(byType("fuzzy_name"));
}

/*
 Processes a single transaction end to end: fetch candidates, score them,
 log every candidate that cleared LOG_FLOOR (the audit trail), then either
 apply an auto-match or leave it for the review queue.
 
 Idempotent by convention, not by itself: callers should only pass
 transactions with match_status = 'unmatched' (see run.ts) so re-running
 the engine doesn't reprocess something already decided.
*/
export async function processTransaction(
  client: PoolClient,
  txn: TransactionRow
): Promise<MatchOutcome> {
  const candidateRows = await fetchCandidateInvoices(client, txn);
  const scored = scoreAllCandidates(candidateRows, Number(txn.amount));

  await logAttempts(client, txn, scored);

  if (scored.length === 0) {
    await logNoMatch(client, txn, "no open invoice matched on reference, amount+time, or name");
    await client.query(
      `UPDATE transactions SET match_status = 'needs_review' WHERE id = $1`,
      [txn.id]
    );
    return { transaction_id: txn.id, decision: "needs_review", candidate_count: 0 };
  }

  const winner = pickWinner(scored);
  const isAmbiguousExactMatch =
    winner.match_type === "exact_reference" &&
    scored.filter((c) => c.match_type === "exact_reference").length > 1;

  if (winner.score < REVIEW_FLOOR) {
    await client.query(
      `UPDATE transactions SET match_status = 'needs_review' WHERE id = $1`,
      [txn.id]
    );
    return { transaction_id: txn.id, decision: "needs_review", winner, candidate_count: scored.length };
  }

  if (isAmbiguousExactMatch) {
    // Two+ open invoices both contain their reference_code in this one
    // narration — most likely duplicate/near-duplicate reference codes on
    // the merchant's side. Picking the higher-scoring one and moving on
    // would silently paper over a data problem with real money attached;
    // surface it instead.
    await client.query(
      `UPDATE transactions SET match_status = 'needs_review' WHERE id = $1`,
      [txn.id]
    );
    return { transaction_id: txn.id, decision: "needs_review", winner, candidate_count: scored.length };
  }

  if (winner.match_type === "exact_reference" && winner.score >= AUTO_MATCH_THRESHOLD) {
    await applyMatch(client, txn, winner);
    const isFull = Math.abs(Number(txn.amount) - winner.remaining) < 0.01 || Number(txn.amount) > winner.remaining;
    return {
      transaction_id: txn.id,
      decision: isFull ? "matched" : "partial",
      winner,
      candidate_count: scored.length,
    };
  }

  // amount_time or fuzzy_name, however high the score: review, never auto-apply.
  await client.query(
    `UPDATE transactions SET match_status = 'needs_review' WHERE id = $1`,
    [txn.id]
  );
  return { transaction_id: txn.id, decision: "needs_review", winner, candidate_count: scored.length };
}
